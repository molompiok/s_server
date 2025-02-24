import { Logs, storeNameSpace, writeFile } from "#controllers/Utils/functions"
import Store from "#models/store"
import env from "#start/env"
import db from "@adonisjs/lucid/services/db"
import { execa } from "execa"
import fs from 'fs/promises'

export { removeNginxDomaine, createRedisConfig, updateNginxServer , updateNginxStoreDomaine}


async function removeNginxDomaine(name: string) {
    const logs = new Logs(removeNginxDomaine);
    try {
        logs.log(`💀 Supression des fichiers de configuration nginx...`)
        await execa('sudo', ['rm','-f', `/etc/nginx/sites-available/${name}`])
        await execa('sudo', ['rm','-f', `/etc/nginx/sites-enabled/${name}`])
        await execa('sudo', ['systemctl', 'restart', 'nginx']);
        logs.log(`✅ Permission supprimés  avec succès 👍`);
    } catch (error) {
        logs.notifyErrors(`❌ Erreur lors de la supression des fichers Nginx`,{name}, error)
    }
    return logs
}
async function updateNginxStoreDomaine(store:Store) {
    const logs = new Logs(removeNginxDomaine);
    
    const  host = env.get('HOST');
    const { BASE_ID }= storeNameSpace(store.id);
    
    let domaines:Array<string>=[];
    
    try {
        domaines = JSON.parse(store.domaines);
    } catch (error) {}
    
    if(domaines.length <=0){
        return logs.merge(await removeNginxDomaine(BASE_ID));
    }

    const config = `
server {
    listen 80;
    listen [::]:80;
    server_name ${domaines.join(' ')};

    location / {
        proxy_pass http://${host}:${store.api_port};
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}`
    return logs.merge(await createRedisConfig(BASE_ID,config));
}
async function updateNginxServer() {
    
    const stores = await db.query().from(Store.table);

    let listNames = '';

    const  host = env.get('HOST');
    const  port = env.get('PORT');

    stores.forEach(s=>listNames+=`
        location /${s.name} {
        proxy_pass http://${host}:${s.api_port}/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
`);

    const config = `
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
    return new Logs(updateNginxServer).merge(await createRedisConfig('server',config));
}

async function createRedisConfig(name: string, nginxConfig: string) {
    const logs = new Logs(createRedisConfig);
    const site_available = `/etc/nginx/sites-available/${name}.conf`
    const site_enable = `/etc/nginx/sites-enabled/`

    logs.log('🔹 Écrire la configuration dans le fichier Nginx');

    logs.merge(await writeFile(site_available, nginxConfig))
    if(!logs.ok) return logs;
    logs.log('🔹 Activer le site en créant un lien symbolique');

    //TODO tester si un linque existe deja
    try {        
        await execa('sudo', ['ln','-s', site_available, site_enable])
    } catch (error) {
        const link_enabled = site_available.replace('available','enabled');
        logs.log(`🔍 🧐 Lien non cree, un test d'existance du lien necessaire ${link_enabled}`);
        try {
            await fs.stat(link_enabled);
            logs.log(`✅ Le fichier existe deja pas de soucies `,link_enabled);
        } catch (error) {
            logs.log(`❌ Le fichier ${link_enabled} n'existe pas, et  ne peut etre linker via ${site_available}`);
        }
    }
    logs.log('🔹 Tester et recharger Nginx');

    try {
        await execa('sudo', ['nginx','-t'])
        await execa('sudo', ['systemctl','reload', 'nginx'])
        logs.log(`✅ Nginx configuré pour ${name}`)
    } catch (error) {
        logs.notifyErrors(`❌ Erreur Pendant la creation du nignx config`,{site_available,name,nginxConfig}, error)
    }
    return logs
}


/*


*/























// async function generateNginxConfig(BASE_ID: string, urls: string[], PORT: number) {


//   // Filtrer les domaines avec et sans sous-chemins
//   const main_domains = urls.filter(url => !url.includes('/'))
//   const path_domains = urls.filter(url => url.includes('/'))

//   // 🔹 Configuration pour les domaines normaux (ex: ladona.com, ladona.sublymus.com)
//   let nginxConfig =
//     main_domains.length<=0 ? '':
// `
// server {
//     listen 80;
//     listen [::]:80;
//     server_name ${main_domains.join(' ')};

//     location /.well-known/acme-challenge/ {
//         root /var/www/letsencrypt;
//     }

//     location / {
//         return 301 https://$host$request_uri;
//     }
// }
// server {
//     listen 443 ssl;
//     listen [::]:443 ssl;
//     server_name ${main_domains.join(' ')};

//     # ssl_certificate /etc/letsencrypt/live/${main_domains[0]}/fullchain.pem;
//     # ssl_certificate_key /etc/letsencrypt/live/${main_domains[0]}/privkey.pem;

//     location / {
//         proxy_pass http://127.0.0.1:${PORT};
//         proxy_set_header Host $host;
//         proxy_set_header X-Real-IP $remote_addr;
//         proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
//         proxy_set_header X-Forwarded-Proto $scheme;
//     }

//     location /ws/ {
//         proxy_pass http://127.0.0.1:${PORT};
//         proxy_http_version 1.1;
//         proxy_set_header Upgrade $http_upgrade;
//         proxy_set_header Connection "Upgrade";
//     }

//     access_log /var/log/nginx/${BASE_ID}_access.log;
//     error_log /var/log/nginx/${BASE_ID}_error.log;
// }
// `

//   // 🔹 Configuration pour les sous-chemins (ex: sublymus.com/ladona)
//   path_domains.forEach(url => {
//     const [baseDomain, path] = url.split('/')
//     nginxConfig += `
// server {
//     listen 443 ssl;
//     listen [::]:443 ssl;
//     server_name ${baseDomain};

//     #ssl_certificate /etc/letsencrypt/live/${baseDomain}/fullchain.pem;
//     #ssl_certificate_key /etc/letsencrypt/live/${baseDomain}/privkey.pem;

//     location /${path} {
//         proxy_pass http://127.0.0.1:${PORT};
//         proxy_set_header Host $host;
//         proxy_set_header X-Real-IP $remote_addr;
//         proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
//         proxy_set_header X-Forwarded-Proto $scheme;
//     }
// }
// `
//   })

// }


