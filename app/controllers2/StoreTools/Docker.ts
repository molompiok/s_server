
import { Logs, newContainerName, serviceNameSpace } from "../Utils/functions.js"
import Store from "#models/store"
import { execa } from "execa"
import { allocAvalaiblePort } from "./PortManager.js"
import { HOST_PORT } from "../Utils/Interfaces.js"
import db from "@adonisjs/lucid/services/db"
import env from "#start/env"
import { RedisEmitter, sendByRedis } from "./RedisBidirectional.js"
import { updateNginxServer } from "./Nginx.js"


export {
    runServiceInstance,
    delete_all_service,
    delete_all_service_required,
    delete_instance,
    delete_instance_required,
    delete_service,
    delete_service_requied,
    inspectDockerService,
    InspectDockerAllService,
    listAllServiceId
}

type REQUIRED_ENV = {
    SERVICE_ID: string,
    BASE_ID: string,
    PORT: string,
    EXTERNAL_PORT: string,
    HOST: string,
    GROUPE_NAME: string,
    // OWNER_ID: string,
    CONTAINER_NAME: string,
    // LOG_LEVEL?: string,
    // APP_KEY?: string,
    // NODE_ENV?: string,
    // DB_USER: string,
    REDIS_HOST?: string,
    REDIS_PORT?: string,
    REDIS_PASSWORD?: string,
    USER_NAME: string,
    DOCKER_IMAGE: string,
    VOLUME_TARGET: string,
    VOLUME_SOURCE: string,
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

async function listServiceInstances(serviceName: string) {
    if (!serviceName) {
        return []
    }
    try {
        const { stdout } = await execa('sudo', ['docker', 'ps', '-a', '-q', '--filter', `name=${serviceName}`]);
        return stdout.split('\n');
    } catch (error) {
        return []
    }
}

async function listAllServiceId() {
    try {
        const { stdout } = await execa('sudo', ['docker', 'ps', '-a', '-q']);
        return stdout.split('\n');
    } catch (error) {
        return []
    }
}

async function delete_all_service() {
    const logs = new Logs(delete_all_service)
    try {
        logs.log('🗑️ Suppression  de tout les services')
        const list = await listAllServiceId();
        const promises = list.map(id=>new Promise(async(rev)=>{
            await execa('sudo', ['docker', 'rm', '-f', id])
            rev(id);
        })) 
        await Promise.allSettled(promises);
        
        logs.log('✅  Suppression  de tout les services Terminee ')

    } catch (error) {
        logs.notifyErrors('❌ Error de  Suppresion multiple de tout les services, delete_all_service', error)
    }
    return logs
}

async function delete_all_service_required() {
    const logs = new Logs(delete_all_service_required);
    try {
        const list = await listAllServiceId();
        const promises = list.map(id=>new Promise(async(rev)=>{
            logs.merge(await delete_instance_required({ id }))
            rev(id);
        })) 
        await Promise.allSettled(promises);
    } catch (error) {
        logs.notifyErrors(`❌ Error lors de la suppression de tout les  services, delete_all_service_required`, error)
    }
    return logs
}

async function delete_service(serviceName: string) {
    const logs = new Logs(delete_service)
    try {
        logs.log('🗑️ Suppression de l\'service, ServiceName: ', serviceName)
        const list = await listServiceInstances(serviceName);
        const promises = list.map(id=>new Promise(async(rev)=>{
            await execa('sudo', ['docker', 'rm', '-f', id])
            rev(id);
        })) 
        await Promise.allSettled(promises);
        
        logs.log('✅  Suppression Terminee, ServiceName: ', serviceName)

    } catch (error) {
        logs.notifyErrors('❌ Error de  Suppresion multiple des instances du service ', { serviceName }, error)
    }
    return logs
}

async function delete_service_requied(serviceName: string) {
    // delete_service(serviceName)
    const logs = new Logs(delete_service_requied);
    try {
        const list = await listServiceInstances(serviceName);
        const promises = list.map(id=>new Promise(async(rev)=>{
            logs.merge(await delete_instance_required({ id }))
            rev(id);
        })) 
        await Promise.allSettled(promises);
    } catch (error) {
        logs.notifyErrors(`❌ Error lors de la suppression de l'service, delete_service_required`, { serviceName }, error)
    }
    return logs
}

async function delete_instance(instance: { name?: string, id?: string }) {
    const logs = new Logs(delete_instance);
    const ref = instance.name || instance.id || ''
    try {
        logs.log(`🚀 Suppression de l'insatnce docker`, { ref, instance })
        await execa('sudo', ['docker', 'rm', '-f', `${ref}`])
        logs.log(`✅ Container(${ref}) Supprimé avec succès 👍`)
    } catch (error) {
        logs.notifyErrors(`❌ Erreur lors du reload du container :`, { instance }, error)
    }
    return logs
}

async function delete_instance_required(instance: { name?: string, id?: string }) {
    
    /** INITIALISATION logs, ref */
    const logs = new Logs(delete_instance_required);
    const ref = instance.name || instance.id || ''
    if (!ref) return logs.asNotOk()

    console.log(`🗑️ Supression de l'instance(${ref})`, { instance });
    
    try {

        const { stdout } = await execa('sudo', ['docker', 'inspect', ref])
        const info = JSON.parse(stdout);
        let BASE_ID = info[0]?.Name.split('_')[1];

        if (!BASE_ID) return logs.logErrors('BASE_ID is not inculde in Docker instance name')
        const deleteEvent = 'delete_required';
        
        await new Promise(async (rev) => {
            
            const listerner = async () => {
                let time = Date.now()
                logs.log('============= Start Suppression');
                RedisEmitter.removeListener(`${BASE_ID}:${deleteEvent}`, listerner)
                await delete_instance(instance);
                logs.log('============= Start Suppression =================>>>', Date.now()-time);
                logs.log('============= Write in Nginx File');
                time = Date.now();
                await updateNginxServer();
                logs.log('============= Write in Nginx File ============================>>>', Date.now()-time);
                rev(logs);
            }

            RedisEmitter.addListener(`${BASE_ID}:${deleteEvent}`, listerner);// a 0 l'insatnce emet l'event delete_required et on le supprime
            
            await sendByRedis(BASE_ID, { event: deleteEvent, data: {} })// l'instance commence a compter les requetes
            
            setTimeout(async () => {
                await listerner();
                logs.log(`💀 Instance Supprimé avec succès 👍 type=TIME_OUT`, instance);
            }, 10000);

        })
        console.log( '##################################', { instance });
    } catch (error) {
        logs.notifyErrors(`❌ Error lors de la suppression de l'instance, delete_instance_required`, { instance }, error)
    }
    return logs
}

// Test avec un utilisateur

async function runServiceInstance<T extends REQUIRED_ENV>(envData: T, retry?: (external_port: string) => Promise<{ host: string, port: number }>, count: number = 0) {
    const logs = new Logs(runServiceInstance);
    let data: {
        EXTERNAL_PORT: string,
        HOST: string,
        CONTAINER_NAME: string
    } = envData;
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
            '-e', `USER_ID=${id || envData.USER_NAME}`,
            envData.DOCKER_IMAGE,
        ])
        logs.log(`✅ Instance Docker ${envData.CONTAINER_NAME} lancée`)
    }
    try {
        await launch(envData.EXTERNAL_PORT);

    } catch (error) {
        if (error.stderr.includes('You have to remove (or rename)')) {
            logs.log(`🚫Il semble que le nom (${envData.CONTAINER_NAME}) est deja utilise`, error.stderr);
        } else if (error.stderr.includes('port is already allocated') || error.stderr.includes('invalid IP address')) {
            logs.log(`🚫Il semble que le port (${envData.EXTERNAL_PORT}) est deja utilise`, error.stderr);
        } else return logs.notifyErrors(`❌ Erreur lors du lancement de l'instance Docker :`, { envData }, error)

        if (count < env.get('MAX_RELAUNCH_API_INSTANCE')) {
            const h_p = await retry?.(envData.EXTERNAL_PORT) || await allocAvalaiblePort();
            data = {
                EXTERNAL_PORT: `${h_p.host}:${h_p.port.toString()}`,
                HOST: h_p.host,
                CONTAINER_NAME: newContainerName({ lastName: envData.CONTAINER_NAME })
            };
            logs.log(`🔃 Nouvelle tentative`, data);
            return await runServiceInstance({ ...envData, ...data }, retry, ++count);
        } else return logs.notifyErrors(`❌ Nombre de tentative(${count + 1}) pour lancer l'service instance est superireur a la limit(${env.get('MAX_RELAUNCH_API_INSTANCE')})`, { envData }, error)
    }
    return logs.return(data);
}

type InstanceInfo = {
    running: boolean,
    h_p: HOST_PORT,
    containerId: string,
    status: string, 
    containerName?: string
    serviceName: string
    version:string
}


async function inspectDockerService(serviceName: string) {
    let instanceInfos: InstanceInfo[] = [];
    try {
        const ids = await listServiceInstances(serviceName);
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
                serviceName,
                containerName: info.Name,
                version:info[0].Config.Image
            }

            console.log(`${serviceName} is ${instanceInfo.running ? '🟢' : '⚠️'} ${info[0].State['Status']} on ${instanceInfo.h_p.host}:${instanceInfo.h_p.port}`);

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
            serviceName,
            version:''
        }]
        console.log(`${serviceName} is 🔴 on Error, redirect to maintenace theme => ${instanceInfos[0].h_p.host}:${instanceInfos[0].h_p.port}`);
        return instanceInfos
    }
}


async function InspectDockerAllService() {
    const stores = await db.from(Store.table);
    let promises: Promise<InstanceInfo[] | undefined>[] = []
    for (const store of stores) {
        const { CONTAINER_NAME } = serviceNameSpace(store.id);
        promises.push(inspectDockerService(CONTAINER_NAME))
    }
    const info = (await Promise.allSettled(promises)).map(v => (v as any).value as InstanceInfo[]).filter(v => !!v);
    return info
}
