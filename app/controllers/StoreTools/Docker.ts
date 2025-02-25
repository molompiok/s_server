
import { Logs, storeNameSpace } from "#controllers/Utils/functions"
import Store from "#models/store"
import { execa } from "execa"
import { allocAvalaiblePort } from "./PortManager.js"


export {
    runDockerInstance,
    deleteDockerContainer,
    reloadDockerContainer,
    startDockerInstance,
    stopDockerInstance,
    runAllActiveStore,
    removeAllDockerContainer
}

/************************************
        PORT MANAGER
*************************************/

async function getUserIds(username: string) {
    try {
        const uid = (await execa('id', ['-u', username])).stdout.trim()
        const gid = (await execa('id', ['-g', username])).stdout.trim()
        console.log(`✅ Utilisateur trouvé : UID=${uid}, GID=${gid}`)
        return { uid, gid }
    } catch (error) {
        console.error(`❌ L'utilisateur '${username}' n'existe pas.`)
        return null
    }
}

type REQUIRED_ENV = {
    STORE_ID: string,
    BASE_ID: string,
    OWNER_ID: string,
    TZ?: string,
    HOST: string,
    LOG_LEVEL?: string,
    APP_KEY?: string,
    NODE_ENV?: string,
    DB_USER: string,
    DB_HOST?: string,
    DB_PORT?: string,
    DB_PASSWORD: string,
    DB_DATABASE?: string,
    REDIS_HOST?: string,
    REDIS_PORT?: string,
    REDIS_PASSWORD?: string,
    GROUPE_NAME: string,
    PORT: string,
    EXTERNAL_PORT: string,
    USER_NAME: string,
    DOCKER_IMAGE: string,
    VOLUME_TARGET: string,
    VOLUME_SOURCE: string,
    CONTAINER_NAME: string,
    STORE_NAME?: string, //TODO a suprimer
    THEME_ID?: string//TODO a suprimer
}

async function removeAllDockerContainer(target: 'ALL' | 'ACTIVE' | 'STOP') {
    const logs = new Logs(removeAllDockerContainer)
    try {
        if (target == 'ALL') {
            logs.log('🗑️ Suppression des Docker container existant')
            await execa('sudo', ['docker', 'rm', '-f', '$(sudo docker ps -qa)'])
            logs.log('✔️ Sppression Terminee')
        }
        else if (target == 'ACTIVE') {
            logs.log('🗑️ Suppression des Docker container actifs')
            await execa('sudo', ['docker', 'rm', '-f', '$(sudo docker ps -q)'])
            logs.log('✔️ Sppression Terminee')
        }else if(target == 'STOP'){
            logs.log('🗑️ Suppression des Docker container en arret')
            await execa('sudo', ['docker', 'rm', '-f', '$(sudo docker ps -qa)'])
            logs.log('✔️ Sppression Terminee')
        }
    } catch (error) {
        logs.notifyErrors('❌ Error de  Suppresion multiple des instances docker ', {target},error)
    }
    return logs
}

async function runAllActiveStore<T extends { DOCKER_IMAGE: string, PORT: string }>(envRequied: T) {
    const stores = await Store.all();
    const logs = new Logs(runAllActiveStore);
    for (const store of stores) {

        const nameSpace = storeNameSpace(store.id);
        const host_port = await allocAvalaiblePort()
        logs.merge(await runDockerInstance({
            ...nameSpace,
            ...envRequied,
            EXTERNAL_PORT: `${host_port.host}:${host_port.port}`,
            STORE_ID: store.id,
            OWNER_ID: store.user_id,
            // TZ: 'UTC',
            HOST: '0.0.0.0',
            // LOG_LEVEL: 'info',
            // APP_KEY: '4IihbmaY6Fnj2Kf1uXSwWoAc3qA0jlFk',
            NODE_ENV: 'production',
            DB_USER: nameSpace.USER_NAME,
            // DB_HOST: '127.0.0.1',
            // DB_PORT: '5432',
            // REDIS_HOST: '127.0.0.1',
            // REDIS_PORT: '6379',
            // REDIS_PASSWORD: 'redis_w',
            // PORT: '3334',
            DOCKER_IMAGE: 's_api:v1.0.0', // donner par l'api
            STORE_NAME: 'STORE_NAME',
            THEME_ID: 'THEME_ID'
        }))
    }
    return logs

}
// Test avec un utilisateur

async function runDockerInstance<T extends REQUIRED_ENV>(envData: T) {
    const logs = new Logs(runDockerInstance);
    try {

        logs.log(`🚀 Démarrage du conteneur Docker: ${envData.CONTAINER_NAME}`)
        const envArgs = Object.entries(envData).flatMap(([key, value]) => ['-e', `${key}=${value}`])
        const ids = await getUserIds(envData.USER_NAME)
        await execa('sudo', [
            'docker', 'run', '-d', '-it',
            ...(ids ? ['-u', `${ids.uid}:${ids.gid}`] : []),
            '--name', envData.CONTAINER_NAME,
            '-p', `${envData.EXTERNAL_PORT}:${envData.PORT}`,
            '-v', `${envData.VOLUME_SOURCE}:${envData.VOLUME_TARGET}`,
            ...envArgs,
            ...(ids ? ['-e', `USER_ID=${ids?.uid}`] : []),
            envData.DOCKER_IMAGE,
        ])
        logs.log(`✅ Instance Docker ${envData.CONTAINER_NAME} lancée`)

        const { stdout } = await execa('sudo', ['docker', 'ps'])
        logs.log('✅ Docker fonctionne dans Node.js:', stdout)

    } catch (error) {
        logs.notifyErrors(`❌ Erreur lors du lancement de l'instance Docker :`, { envData }, error)
    }
    return logs
}


async function deleteDockerContainer(containerName: string, force = true) {
    const logs = new Logs(deleteDockerContainer);
    try {
        logs.log(`🚀 Suppression de l'insatnce docker ${containerName}`)
        await execa('sudo', ['docker', 'rm', ...(force ? ['-f'] : []), containerName]);
        logs.log(`✅ Container Supprimé avec succès 👍`)
    } catch (error) {
        logs.notifyErrors(`❌ Erreur lors du reload du container :`, { containerName, force }, error)
    }
    return logs
}

async function reloadDockerContainer(containerName: string) {
    const logs = new Logs(reloadDockerContainer);
    try {
        logs.log(`🚀 Reload du container docker ${containerName}`)
        await execa('sudo', ['docker', 'restart', containerName])
        logs.log(`✅ Container Relancée avec succès 👍`)
    } catch (error) {
        logs.notifyErrors(`❌ Erreur lors du reload du container :`, { containerName }, error)
    }
    return logs
}

async function stopDockerInstance(containerName: string) {
    const logs = new Logs(stopDockerInstance);
    try {
        logs.log(`🚀 Stop de l'insatnce docker ${containerName}`);
        await execa('sudo', ['docker', 'stop', `${containerName}`])
        logs.log(`✅ Container Stopé avec succès 👍`)
    } catch (error) {
        logs.notifyErrors(`❌ Erreur lors de l'arret du container :`, { containerName }, error)
    }
    return logs
}
async function startDockerInstance(containerName: string) {
    const logs = new Logs(startDockerInstance);
    try {

        logs.log(`🚀 Start de l'insatnce docker ${containerName}`)
        await execa('sudo', ['docker', 'start', containerName])
        logs.log(`✅ Container Stopé avec succès 👍`)
    } catch (error) {
        logs.notifyErrors(`❌ Erreur lors du lancement du container :`, { containerName }, error)
    }
    return logs
}