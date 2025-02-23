
import { Logs } from "#controllers/Utils/functions"
import { execa } from "execa"


export {
    runDockerInstance,
    deleteDockerContainer,
    reloadDockerContainer,
    startDockerInstance,
    stopDockerInstance,
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

// Test avec un utilisateur

async function runDockerInstance<T extends {
    USER_NAME: string,
    PORT: string,
    EXTERNAL_PORT: string,
    DOCKER_IMAGE: string,
    VOLUME_TARGET: string,
    VOLUME_SOURCE: string,
    CONTAINER_NAME: string,
}>(envData: T) {
    const logs = new Logs(runDockerInstance);
    try {

        logs.log(`🚀 Démarrage du conteneur Docker: ${envData.CONTAINER_NAME}`)
        const envArgs = Object.entries(envData).flatMap(([key, value]) => ['-e', `${key}=${value}`])
        const ids = await getUserIds(envData.USER_NAME)
        await execa('sudo', [
            'docker','run', '-d', '-it',
            ...(ids ? ['-u', `${ids.uid}:${ids.gid}`] : []),
            '--name', envData.CONTAINER_NAME,
            '-p', `${envData.EXTERNAL_PORT}:${envData.PORT}`,
            '-v', `${envData.VOLUME_SOURCE}:${envData.VOLUME_TARGET}`,
            ...envArgs,
            ...(ids ? ['-e', `USER_ID=${ids?.uid}`] : []),
            envData.DOCKER_IMAGE,
        ])
        logs.log(`✅ Instance Docker ${envData.CONTAINER_NAME} lancée`)

        const { stdout } = await execa('sudo', ['docker','ps'])
        logs.log('✅ Docker fonctionne dans Node.js:', stdout)

    } catch (error) {
        logs.notifyErrors(`❌ Erreur lors du lancement de l'instance Docker :`,{envData}, error)
    }
    return logs
}


async function deleteDockerContainer(containerName: string, force = true) {
    const logs = new Logs(deleteDockerContainer);
    try {
        logs.log(`🚀 Suppression de l'insatnce docker ${containerName}`)
        await execa('sudo', ['docker','rm', ...(force ? ['-f'] : []), containerName]);
        logs.log(`✅ Container Supprimé avec succès 👍`)
    } catch (error) {
        logs.notifyErrors(`❌ Erreur lors du reload du container :`,{containerName,force}, error)
    }
    return logs
}

async function reloadDockerContainer(containerName: string) {
    const logs = new Logs(reloadDockerContainer);
    try {
        logs.log(`🚀 Reload du container docker ${containerName}`)
        await execa('docker', ['restart', containerName])
        logs.log(`✅ Container Relancée avec succès 👍`)
    } catch (error) {
        logs.notifyErrors(`❌ Erreur lors du reload du container :`,{containerName}, error)
    }
    return logs
}

async function stopDockerInstance(containerName: string) {
    const logs = new Logs(stopDockerInstance);
    try {
        logs.log(`🚀 Stop de l'insatnce docker ${containerName}`)
        await execa('docker', ['stop', `${containerName}`])
        logs.log(`✅ Container Stopé avec succès 👍`)
    } catch (error) {
        logs.notifyErrors(`❌ Erreur lors de l'arret du container :`,{containerName}, error)
    }
    return logs
}
async function startDockerInstance(containerName: string) {
    const logs = new Logs(startDockerInstance);
    try {

        logs.log(`🚀 Start de l'insatnce docker ${containerName}`)
        await execa('docker', ['start', containerName])
        logs.log(`✅ Container Stopé avec succès 👍`)
    } catch (error) {
        logs.notifyErrors(`❌ Erreur lors du lancement du container :`,{containerName}, error)
    }
    return logs
}