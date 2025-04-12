import { Logs } from "../Utils/functions.js";
import Store from "#models/store"
import env from "#start/env";
import db from "@adonisjs/lucid/services/db";
import { execa } from "execa";
import fs from "fs/promises";


export { inpectAppDirs, inpectDir }


async function inpectDir(storesId: string[], dir: string, ignoreFiles: string[] = []) {
    const logs = new Logs(inpectDir);
    const files = await fs.readdir(dir as any);
    const promises = files.map(fileName => new Promise(async (rev) => {
        try {
            const store_exist = storesId.find(s_id => s_id.startsWith(fileName));
            if (!store_exist && !ignoreFiles.includes(fileName)) {
                const url = `${dir}/${fileName}`;
                logs.notifyErrors('🏴‍☠️ ❌ ⛔ Un Fichier sans store rattacher a ete trouver.', { store_exist, url })
                await execa('sudo', ['rm', '-rf', `${dir}/${fileName}`])
                console.log("💀 File deleted successfully", url);
            }
            rev(logs);
        } catch (error) {
            logs.notifyErrors(' ❌ Error lors de l\'anayse du dir', { storesId, dir, ignoreFiles })
        }
    }));
    await Promise.allSettled(promises);
    return logs
}

const inpectAppDirs = (async () => {
    console.log(`🔎 💾 Analyse des repertoires, (VOLUMES, NGINX_ENABLED, NGINX_AVAILABLE)`);
    const stores = await db.from(Store.table).select('id');
    const stores_id = stores.map(s => s.id);
    const logs = new Logs(inpectAppDirs);
    const list = await Promise.allSettled([
        await inpectDir(stores_id, '/etc/nginx/sites-available', ['default', 'server.conf']),
        await inpectDir(stores_id, '/etc/nginx/sites-enabled', ['default', 'server.conf']),
        await inpectDir(stores_id, env.get("S_API_VOLUME_SOURCE"))
    ]);
    list.map(l=>(l as any).value as Logs).forEach(l=>{
        logs.merge(l);
    }) 
    return logs
});










