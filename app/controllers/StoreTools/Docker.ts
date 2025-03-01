
import { Logs, newContainerName, storeNameSpace } from "#controllers/Utils/functions"
import Store from "#models/store"
import { execa } from "execa"
import { allocAvalaiblePort } from "./PortManager.js"
import { HOST_PORT } from "#controllers/Utils/Interfaces"
import db from "@adonisjs/lucid/services/db"
import env from "#start/env"
import { RedisEmitter, sendByRedis } from "./RedisBidirectional.js"
import { updateNginxServer } from "./Nginx.js"


export {
    runApiInstance,
    delete_all_api,
    delete_all_api_required,
    delete_instance,
    delete_instance_required,
    delete_api,
    delete_api_requied,
    runAllActiveStoreApi,
    inspectDockerApi,
    InspectDockerAllApi,
    listAllApiId
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

async function getUserIds(username: string) {
    try {
        const uid = (await execa('id', ['-u', username])).stdout.trim()
        return uid
    } catch (error) {
        console.error(`❌ L'utilisateur '${username}' n'existe pas.`)
        return null
    }
}

async function listApiContainers(apiName: string) {
    if (!apiName) {
        return []
    }
    try {
        const { stdout } = await execa('sudo', ['docker', 'ps', '-a', '-q', '--filter', `name=${apiName}`]);
        return stdout.split('\n');
    } catch (error) {
        return []
    }
}

async function listAllApiId() {
    try {
        const { stdout } = await execa('sudo', ['docker', 'ps', '-a', '-q']);
        return stdout.split('\n');
    } catch (error) {
        return []
    }
}
/*
delete_all_api()
delete_all_api_requied()
delete_api()
delete_api_required()
delete_instance()
delete_instance_required()
run_api_instance(env,(host, port)=>{host, port});

*/

async function delete_all_api() {
    const logs = new Logs(delete_all_api)
    try {
        logs.log('🗑️ Suppression des Docker container')
        const list = await listAllApiId();
        let accu = ''
        for (const l of list) {
            await execa('sudo', ['docker', 'rm', '-f', `${l}`])
            accu += `${l}, `
        }
        logs.log('✔️ Sppression Terminee ',accu)

    } catch (error) {
        logs.notifyErrors('❌ Error de  Suppresion multiple des instances docker ', error)
    }
    return logs
}
async function delete_all_api_required() {
    const logs = new Logs(delete_all_api_required);
    try {
        const list = await listAllApiId();
        for (const id of list) {
            await delete_instance_required({id})
        }
    } catch (error) {
        logs.notifyErrors(`❌ Error lors de la suppression de tout les l'api, delete_all_api_required`, error)
    }
    return logs
}

async function delete_api(apiName: string) {
    const logs = new Logs(delete_api)
    try {
        logs.log('🗑️ Suppression de l\'api, ApiName: ', apiName)
        const list = await listApiContainers(apiName);
        let accu = ''
        for (const l of list) {
            await execa('sudo', ['docker', 'rm', '-f', `${l}`])
            accu += `${l}, `
        }
        logs.log('✔️ Suppression Terminee, ApiName: ', apiName)

    } catch (error) {
        logs.notifyErrors('❌ Error de  Suppresion multiple des instances docker ', { apiName }, error)
    }
    return logs
}

async function delete_api_requied(apiName: string) {
    // delete_api(apiName)
    const logs = new Logs(delete_api_requied);
    try {
        const list = await listApiContainers(apiName);
        for (const id of list) {
            await delete_instance_required({id})
        }
    } catch (error) {
        logs.notifyErrors(`❌ Error lors de la suppression de l'api, delete_api_required`, { apiName }, error)
    }
    return logs
}

async function delete_instance(instance: { name?: string, id?: string }) {
    const logs = new Logs(delete_instance);
    const ref = instance.name || instance.id||''
    try {
        logs.log(`🚀 Suppression de l'insatnce docker`, {ref,instance})
        await execa('sudo', ['docker', 'rm', '-f', `${ref}`])
        logs.log(`✅ Container(${ref}) Supprimé avec succès 👍`)
    } catch (error) {
        logs.notifyErrors(`❌ Erreur lors du reload du container :`, { instance }, error)
    }
    return logs
}

async function delete_instance_required(instance: { name?: string, id?: string }) {
    const logs = new Logs(delete_instance_required);
    const ref = instance.name || instance.id||''
    if(!ref) return logs.asNotOk()
    console.log('@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@',{ref});
    try {
        const { stdout } = await execa('sudo', ['docker', 'inspect', ref ])
        const info = JSON.parse(stdout);
        let store_id = info[0]?.Config?.Env?.filter((e:string)=>e.includes('STORE_ID'))[0];
        
        if(!store_id) return logs.logErrors('STORE_ID is not inculde in Docker instance env')
        store_id = store_id.split('=')[1]
        const {BASE_ID} = storeNameSpace(store_id);
        
        await sendByRedis(BASE_ID,{event:'delete_required',data:{}})// l'instance commence a compter les requetes
        const listerner =async ()=>{
            RedisEmitter.removeListener('delete_required',listerner)
            await delete_instance(instance);
            await updateNginxServer()
        } 
        RedisEmitter.addListener('delete_required',listerner);// a 0 l'insatnce emmet l'event delete_required et on le supprime
        setTimeout(async() => {
            await listerner();
            logs.log(`💀 Instance Supprimé avec succès 👍 type=TIME_OUT`,instance);
        }, 5000);
        console.log('##################################',{instance});
    } catch (error) {
        logs.notifyErrors(`❌ Error lors de la suppression de l'instance, delete_instance_required`, { instance }, error)
    }
    return logs
}

async function runAllActiveStoreApi<T extends { DOCKER_IMAGE: string, PORT: string }>(envRequied: T) {
    const stores = await Store.all();
    const logs = new Logs(runAllActiveStoreApi);
    for (const store of stores) {

        const nameSpace = storeNameSpace(store.id);
        const host_port = await allocAvalaiblePort()
        logs.merge(await runApiInstance({
            ...nameSpace,
            ...envRequied,
            EXTERNAL_PORT: `${host_port.host}:${host_port.port}`,
            STORE_ID: store.id,
            OWNER_ID: store.user_id,
            HOST: '0.0.0.0',
            NODE_ENV: 'production',
            DB_USER: nameSpace.USER_NAME,
            DOCKER_IMAGE: 's_api:v1.0.0', // donner par l'api
            STORE_NAME: 'STORE_NAME',
            THEME_ID: 'THEME_ID'
        }))
    }
    return logs
}
// Test avec un utilisateur

async function runApiInstance<T extends REQUIRED_ENV>(envData: T, retry?: (external_port:string) => Promise<{ host: string, port: number }>, count: number = 0) {
    const logs = new Logs(runApiInstance);
    let data: {
        EXTERNAL_PORT: string,
        HOST: string,
        CONTAINER_NAME: string
    }=envData;
    const launch = async (external_port: string) => {
        logs.log(`'🚀'(${count}) Démarrage du conteneur Docker: ${envData.CONTAINER_NAME}`)
        const envArgs = Object.entries(envData).flatMap(([key, value]) => ['-e', `${key}=${value}`])
        const id = await getUserIds(envData.USER_NAME)
        await execa('sudo', [
            'docker', 'run', '-d', '-it',
            ...(id ? ['-u', `${id}:${id}`] : []),
            '--name', envData.CONTAINER_NAME,
            '-p', `${external_port}:${envData.PORT}`,
            '-v', `${envData.VOLUME_SOURCE}:${envData.VOLUME_TARGET}`,
            ...envArgs,
            '-e', `USER_ID=${id||envData.USER_NAME}`,
            envData.DOCKER_IMAGE,
        ])
        logs.log(`✅ Instance Docker ${envData.CONTAINER_NAME} lancée`)
    }
    try {
        await launch(envData.EXTERNAL_PORT);

    } catch (error) {
        if (error.stderr.includes('You have to remove (or rename)')) {
            logs.log(`🚫Il semble que le nom (${envData.CONTAINER_NAME}) est deja utilise`,error.stderr);
        } else if (error.stderr.includes('port is already allocated')||error.stderr.includes('invalid IP address')) {
            logs.log(`🚫Il semble que le port (${envData.EXTERNAL_PORT}) est deja utilise`,error.stderr);
        } else return logs.notifyErrors(`❌ Erreur lors du lancement de l'instance Docker :`, { envData }, error)

        if (count < env.get('MAX_RELAUNCH_API_INSTANCE')) {
            const h_p = await retry?.(envData.EXTERNAL_PORT) || await allocAvalaiblePort();
            data = {
                EXTERNAL_PORT: `${h_p.host}:${h_p.port.toString()}`,
                HOST:h_p.host,
                CONTAINER_NAME: newContainerName({ lastName: envData.CONTAINER_NAME })
            };
            logs.log(`🔃 Nouvelle tentative`, data);
            return await runApiInstance({ ...envData, ...data }, retry, ++count);
        }else return logs.notifyErrors(`❌ Nombre de tentative(${count+1}) pour lancer l'api instance est superireur a la limit(${ env.get('MAX_RELAUNCH_API_INSTANCE')})`, { envData }, error)
    }
    return logs.return(data);
}

type InstanceInfo = {
    running: boolean,
    h_p: HOST_PORT,
    containerId: string,
    status: string,
    containerName?: string
    apiName: string
}


async function inspectDockerApi(apiName: string) {
    let instanceInfos: InstanceInfo[] = [];
    try {
        const ids = await listApiContainers(apiName);
        if (ids.length <= 0) {
            return instanceInfos
        }
        for (const id of ids) {
            const { stdout } = await execa('sudo', ['docker', 'inspect', id])
            const info = JSON.parse(stdout);
            const instanceInfo: InstanceInfo = {
                running: info[0].State.Running,
                h_p: {
                    date: new Date(info[0].State.StartedAt).getTime(),
                    host: info[0].NetworkSettings.Ports[`${'3334'}/tcp`][0].HostIp,
                    port: info[0].NetworkSettings.Ports[`${'3334'}/tcp`][0].HostPort,
                    weight: 1 // TODO recuperer le weight d'un mamager de weight
                },
                containerId: info[0].Id,
                status: info[0].State.Status,
                apiName,
                containerName: info.Name
            }

            console.log(`${apiName} is ${instanceInfo.running ? '🟢' : '⚠️'} ${info[0].State['Status']} on ${instanceInfo.h_p.host}:${instanceInfo.h_p.port}`);

            instanceInfo.running ? instanceInfos.push(instanceInfo) : await delete_instance({ id });
        }

        return instanceInfos
    } catch (error) {
        instanceInfos = [{
            running: false,
            h_p: {
                date: Date.now(),
                host: '0.0.0.0',
                port: 3999,//TODO Defaut Theme Error
                weight: 1
            },
            containerId: '',
            status: 'Error',
            apiName
        }]
        console.log(`${apiName} is 🔴 on Error, redirect to maintenace theme => ${instanceInfos[0].h_p.host}:${instanceInfos[0].h_p.port}`);
        return instanceInfos
    }
}


async function InspectDockerAllApi() {
    const stores = await db.from(Store.table);
    let promises: Promise<InstanceInfo[] | undefined>[] = []
    for (const store of stores) {
        const { CONTAINER_NAME } = storeNameSpace(store.id);
        promises.push(inspectDockerApi(CONTAINER_NAME))
    }
    const info = (await Promise.allSettled(promises)).map(v => (v as any).value as InstanceInfo[]).filter(v => !!v);
    return info
}
