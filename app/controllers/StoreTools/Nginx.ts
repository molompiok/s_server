import { Logs, storeNameSpace, writeFile } from "#controllers/Utils/functions"
import Store from "#models/store"
import env from "#start/env"
import db from "@adonisjs/lucid/services/db"
import { execa } from "execa"
import fs from 'fs/promises'
import { inspectDockerApi } from "./Docker.js"
import { setRedisStore, updateRedisHostPort } from "./RedisCache.js"

export { removeNginxDomaine, createRedisConfig, updateNginxServer, updateNginxStoreDomaine, getStreamStoreTheme }

async function getStreamStoreTheme(store: Store) {
    const theme_id = store.current_theme_id || store.id
    const { BASE_ID } = storeNameSpace(theme_id)
    const theme_base_id = `_${BASE_ID}`

    const instanceInfos = await inspectDockerApi(BASE_ID);
    const h_ps =  instanceInfos.map(i=>i.h_p)
    updateRedisHostPort(BASE_ID, () => h_ps);
    setRedisStore(store);

    let stream = `
upstream ${theme_base_id} {
    ${h_ps.map(h_p => `server ${h_p.host}:${h_p.port} weight=${h_p.weight};`).join('\n')}
}
`;

    return {
        stream,
        theme_base_id
    }
}

async function removeNginxDomaine(name: string) {
    const logs = new Logs(removeNginxDomaine);
    try {
        logs.log(`💀 Supression des fichiers de configuration nginx...`)
        await execa('sudo', ['rm', '-f', `/etc/nginx/sites-available/${name}`])
        await execa('sudo', ['rm', '-f', `/etc/nginx/sites-enabled/${name}`])
        await execa('sudo', ['systemctl', 'restart', 'nginx']);
        logs.log(`✅ Permission supprimés  avec succès 👍`);
    } catch (error) {
        logs.notifyErrors(`❌ Erreur lors de la supression des fichers Nginx`, { name }, error)
    }
    return logs
}
async function updateNginxStoreDomaine(store: Store) {
    const logs = new Logs(removeNginxDomaine);
    logs.log(`🛠️ Mise a jour du fichier de configuration du domaine :${store.name}`);
    const { BASE_ID } = storeNameSpace(store.id);

    let domaines: Array<string> = [];

    try {
        domaines = JSON.parse(store.domaines);
    } catch (error) { }

    if (domaines.length <= 0) {
        return logs.merge(await removeNginxDomaine(BASE_ID));
    }

    const stream = await getStreamStoreTheme(store)

    const config = `
server {
    listen 80;
    listen [::]:80;
    server_name ${domaines.join(' ')};

    location / {
        proxy_pass http://${stream.theme_base_id};
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}`
    return logs.merge(await createRedisConfig(BASE_ID, config));
}
async function updateNginxServer() {

    console.log(`🛠️ Mise a jour du fichier nginx server.conf`);
    const stores = await db.query().from(Store.table);

    let listNames = '';
    let listStreams: Record<string, string> = {};

    const host = env.get('HOST');
    const port = env.get('PORT');

    for (const s of stores) {
        const stream = await getStreamStoreTheme(s);
        listStreams[stream.theme_base_id] = stream.stream
        listNames += `
    location /${s.name} {
    proxy_pass http://${stream.theme_base_id}/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
`
    }
    let strStreams = '';
    for (const themeId of Object.keys(listStreams)) {
        strStreams += listStreams[themeId];
    }

    const config = `
    ${strStreams}
server {
    listen 80;
    listen [::]:80;
    server_name ${env.get('SERVER_DOMAINE')};

    location / {
        proxy_pass http://${host}:${port};
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    ${listNames}
    
}`
    return new Logs(updateNginxServer).merge(await createRedisConfig('server', config));
}

async function createRedisConfig(name: string, nginxConfig: string) {
    const logs = new Logs(createRedisConfig);
    const site_available = `/etc/nginx/sites-available/${name}.conf`
    const site_enable = `/etc/nginx/sites-enabled/`

    logs.log('🔹 Écrire la configuration dans le fichier Nginx');

    logs.merge(await writeFile(site_available, nginxConfig))
    if (!logs.ok) return logs;
    logs.log('🔹 Activer le site en créant un lien symbolique');

    //TODO tester si un linque existe deja
    try {
        await execa('sudo', ['ln', '-s', site_available, site_enable])
    } catch (error) {
        const link_enabled = site_available.replace('available', 'enabled');
        logs.log(`🔍 🧐 Lien non cree, un test d'existance du lien necessaire ${link_enabled}`);
        try {
            await fs.stat(link_enabled);
            logs.log(`😃 Le fichier existe deja pas de soucies `, link_enabled);
        } catch (error) {
            logs.log(`❌ Le fichier ${link_enabled} n'existe pas, et  ne peut etre linker via ${site_available}`);
        }
    }
    logs.log('🔹 Tester et recharger Nginx');

    try {
        await execa('sudo', ['nginx', '-t'])
        await execa('sudo', ['systemctl', 'reload', 'nginx'])
        logs.log(`✅ Nginx configuré pour ${name}`)
    } catch (error) {
        logs.notifyErrors(`❌ Erreur Pendant la creation du nignx config`, { site_available, name, nginxConfig }, error)
    }
    return logs
}

