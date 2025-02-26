
import { Logs, storeNameSpace } from "#controllers/Utils/functions"
import Store from "#models/store"
import { execa } from "execa"
import { allocAvalaiblePort } from "./PortManager.js"
import { HOST_PORT } from "#controllers/Utils/Interfaces"
import db from "@adonisjs/lucid/services/db"


export {
    runDockerInstance,
    deleteDockerContainer,
    reloadDockerContainer,
    startDockerInstance,
    stopDockerInstance,
    runAllActiveStore,
    removeAllDockerContainer,
    inspectDockerInstance,
    InspectDockerAllInsatnce,
    listAllDockerInstanceId
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
        logs.log('🗑️ Suppression des Docker container', { target })
        const { stdout } = await execa('sudo', ['docker', 'ps', '-qa']);
        const list = stdout.split('\n');
        console.log({ stdout: list });
        for (const l of list) {
            await execa('sudo', ['docker', 'rm', '-f', `${l}`])
        }
        logs.log('✔️ Sppression Terminee', target)

    } catch (error) {
        logs.notifyErrors('❌ Error de  Suppresion multiple des instances docker ', { target }, error)
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

        // const { stdout } = await execa('sudo', ['docker', 'ps'])
        // logs.log('✅ Docker fonctionne dans Node.js:', stdout)

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

type InstanceInfo = {
    running: boolean,
    h_p: HOST_PORT,
    containerId: string,
    status:string,
    containerName:string
}

async function listDockerInstanceId(containerName: string) {
    if (!containerName) {
        return []
    }
    try {
        const { stdout } = await execa('sudo', ['docker', 'ps', '-a', '-q', '--filter', `name=${containerName}`]);
        return stdout.split('\n');
    } catch (error) {
        return []
    }
}

async function listAllDockerInstanceId() {
    try {
        const { stdout } = await execa('sudo', ['docker', 'ps', '-a', '-q']);
        return stdout.split('\n');
    } catch (error) {
        return []
    }
}
async function inspectDockerInstance(containerName: string) {
    let instanceInfos: InstanceInfo[] =[];
    try {
        const ids = await listDockerInstanceId(containerName);
        if (ids.length <= 0) {
            return instanceInfos
        }
        for (const id of ids) {
            const { stdout } = await execa('sudo', ['docker', 'inspect', id])
            const info = JSON.parse(stdout);
            const instanceInfo:InstanceInfo = {
                running: info[0].State.Running,
                h_p: {
                    date: new Date(info[0].State.StartedAt).getTime(),
                    host: info[0].NetworkSettings.Ports[`${'3334'}/tcp`][0].HostIp,
                    port: info[0].NetworkSettings.Ports[`${'3334'}/tcp`][0].HostPort,
                    weight: 1
                },
                containerId: info[0].Id,
                status:info[0].State.Status,
                containerName
            }
            //TODO en pause,restart ou en autr ( not running ) dois je rediriger?
            console.log(`${containerName} is ${instanceInfo.running ? '🟢' : '⚠️'} ${info[0].State['Status']} on ${instanceInfo.h_p.host}:${instanceInfo.h_p.port}`);    
            instanceInfos.push(instanceInfo);
        }
        
        return instanceInfos
    } catch (error) {
        instanceInfos = [ {
            running: false,
            h_p: {
                date: Date.now(),
                host: '0.0.0.0',
                port: 3999,//TODO Defaut Theme Error
                weight: 1
            },
            containerId: '',
            status:'Error',
            containerName
        }]
        console.log(`${containerName} is 🔴 on Error, redirect to maintenace theme => ${instanceInfos[0].h_p.host}:${instanceInfos[0].h_p.port}`);
        return instanceInfos
    }
}


async function InspectDockerAllInsatnce() {
    const stores = await db.from(Store.table);
    let promises: Promise<InstanceInfo[] | undefined>[] = []
    for (const store of stores) {
        const { CONTAINER_NAME } = storeNameSpace(store.id);
        promises.push(inspectDockerInstance(CONTAINER_NAME))
    }
    const info = (await Promise.allSettled(promises)).map(v => (v as any).value as InstanceInfo).filter(v => !!v);
    return info
}

const instanceInfoJSON = [
    {
        "Id": "c7cc7111025ffd7d4b710b9f58a59981ce7d0bbc8c61a58e38708d447d3882ab",
        "Created": "2025-02-25T20:58:06.594582383Z",
        "Path": "docker-entrypoint.sh",
        "Args": [
            "node",
            "ace",
            "serve"
        ],
        "State": {
            "Status": "running",
            "Running": true,
            "Paused": false,
            "Restarting": false,
            "OOMKilled": false,
            "Dead": false,
            "Pid": 162567,
            "ExitCode": 0,
            "Error": "",
            "StartedAt": "2025-02-25T20:58:06.844375188Z",
            "FinishedAt": "0001-01-01T00:00:00Z"
        },
        "Image": "sha256:4726334ddcf3fb6e066f774380e9fad0b86a22893ad88db5ea477ccd2dcb6134",
        "ResolvConfPath": "/var/lib/docker/containers/c7cc7111025ffd7d4b710b9f58a59981ce7d0bbc8c61a58e38708d447d3882ab/resolv.conf",
        "HostnamePath": "/var/lib/docker/containers/c7cc7111025ffd7d4b710b9f58a59981ce7d0bbc8c61a58e38708d447d3882ab/hostname",
        "HostsPath": "/var/lib/docker/containers/c7cc7111025ffd7d4b710b9f58a59981ce7d0bbc8c61a58e38708d447d3882ab/hosts",
        "LogPath": "/var/lib/docker/containers/c7cc7111025ffd7d4b710b9f58a59981ce7d0bbc8c61a58e38708d447d3882ab/c7cc7111025ffd7d4b710b9f58a59981ce7d0bbc8c61a58e38708d447d3882ab-json.log",
        "Name": "/container_42d814d7",
        "RestartCount": 0,
        "Driver": "overlay2",
        "Platform": "linux",
        "MountLabel": "",
        "ProcessLabel": "",
        "AppArmorProfile": "",
        "ExecIDs": null,
        "HostConfig": {
            "Binds": [
                "/volumes/api/42d814d7:/volumes"
            ],
            "ContainerIDFile": "",
            "LogConfig": {
                "Type": "json-file",
                "Config": {}
            },
            "NetworkMode": "bridge",
            "PortBindings": {
                "3334/tcp": [
                    {
                        "HostIp": "0.0.0.0",
                        "HostPort": "4002"
                    }
                ]
            },
            "RestartPolicy": {
                "Name": "no",
                "MaximumRetryCount": 0
            },
            "AutoRemove": false,
            "VolumeDriver": "",
            "VolumesFrom": null,
            "ConsoleSize": [
                0,
                0
            ],
            "CapAdd": null,
            "CapDrop": null,
            "CgroupnsMode": "host",
            "Dns": [],
            "DnsOptions": [],
            "DnsSearch": [],
            "ExtraHosts": null,
            "GroupAdd": null,
            "IpcMode": "private",
            "Cgroup": "",
            "Links": null,
            "OomScoreAdj": 0,
            "PidMode": "",
            "Privileged": false,
            "PublishAllPorts": false,
            "ReadonlyRootfs": false,
            "SecurityOpt": null,
            "UTSMode": "",
            "UsernsMode": "",
            "ShmSize": 67108864,
            "Runtime": "runc",
            "Isolation": "",
            "CpuShares": 0,
            "Memory": 0,
            "NanoCpus": 0,
            "CgroupParent": "",
            "BlkioWeight": 0,
            "BlkioWeightDevice": [],
            "BlkioDeviceReadBps": [],
            "BlkioDeviceWriteBps": [],
            "BlkioDeviceReadIOps": [],
            "BlkioDeviceWriteIOps": [],
            "CpuPeriod": 0,
            "CpuQuota": 0,
            "CpuRealtimePeriod": 0,
            "CpuRealtimeRuntime": 0,
            "CpusetCpus": "",
            "CpusetMems": "",
            "Devices": [],
            "DeviceCgroupRules": null,
            "DeviceRequests": null,
            "MemoryReservation": 0,
            "MemorySwap": 0,
            "MemorySwappiness": null,
            "OomKillDisable": false,
            "PidsLimit": null,
            "Ulimits": [],
            "CpuCount": 0,
            "CpuPercent": 0,
            "IOMaximumIOps": 0,
            "IOMaximumBandwidth": 0,
            "MaskedPaths": [
                "/proc/asound",
                "/proc/acpi",
                "/proc/kcore",
                "/proc/keys",
                "/proc/latency_stats",
                "/proc/timer_list",
                "/proc/timer_stats",
                "/proc/sched_debug",
                "/proc/scsi",
                "/sys/firmware",
                "/sys/devices/virtual/powercap"
            ],
            "ReadonlyPaths": [
                "/proc/bus",
                "/proc/fs",
                "/proc/irq",
                "/proc/sys",
                "/proc/sysrq-trigger"
            ]
        },
        "GraphDriver": {
            "Data": {
                "ID": "c7cc7111025ffd7d4b710b9f58a59981ce7d0bbc8c61a58e38708d447d3882ab",
                "LowerDir": "/var/lib/docker/overlay2/1d471cec5aafc21e5848b7de98a3b15de4edff83833a9fa491df38e99b9bcf6b-init/diff:/var/lib/docker/overlay2/mws4o1318398pk64jzfmda6xi/diff:/var/lib/docker/overlay2/ife2mo13w6xsck30hku6rl1eo/diff:/var/lib/docker/overlay2/6vf98sodpgmsqxfkgc3oj4fke/diff:/var/lib/docker/overlay2/397v1xqz9j98ht2nlc2rz4je9/diff:/var/lib/docker/overlay2/il6kj9w93c8b0dumw9d22p9ep/diff:/var/lib/docker/overlay2/b7131f1609afeca2d44fa932cb478498c1089df7dcec2726e1f42c34c9516b9e/diff:/var/lib/docker/overlay2/46b0102285e496e825fae6f0d101b9b81e15bcd7104a5d529529555e6c7395de/diff:/var/lib/docker/overlay2/3e2485e23b9c95f7557aef4451e3286becbbd8b6b4e1d59e18ddcd1e72da9056/diff:/var/lib/docker/overlay2/280da7f0566937ed3e6930df10c2430ffb6cd1e266226ef3cdc7d1a085e44783/diff:/var/lib/docker/overlay2/9e236d84ae88be188aef7ed74e42a41a6d6e868d69b2d9226cb8f5db58ec70ff/diff:/var/lib/docker/overlay2/384cefae84a61ccfe6c6703e8bee8c1321311cef7d0192c3bb8031c668fd09a2/diff:/var/lib/docker/overlay2/e1f5c6fdd86be89f37da8b9685f262f8897aeea0e4735066f6e8be4b2285bc75/diff:/var/lib/docker/overlay2/24de0d6c2d8d28aef519cd8e2923b9420d56dc40ecbeb4d70e7737c1ee7cae24/diff",
                "MergedDir": "/var/lib/docker/overlay2/1d471cec5aafc21e5848b7de98a3b15de4edff83833a9fa491df38e99b9bcf6b/merged",
                "UpperDir": "/var/lib/docker/overlay2/1d471cec5aafc21e5848b7de98a3b15de4edff83833a9fa491df38e99b9bcf6b/diff",
                "WorkDir": "/var/lib/docker/overlay2/1d471cec5aafc21e5848b7de98a3b15de4edff83833a9fa491df38e99b9bcf6b/work"
            },
            "Name": "overlay2"
        },
        "Mounts": [
            {
                "Type": "bind",
                "Source": "/volumes/api/42d814d7",
                "Destination": "/volumes",
                "Mode": "",
                "RW": true,
                "Propagation": "rprivate"
            }
        ],
        "Config": {
            "Hostname": "c7cc7111025f",
            "Domainname": "",
            "User": "1032:1032",
            "AttachStdin": false,
            "AttachStdout": false,
            "AttachStderr": false,
            "ExposedPorts": {
                "3334/tcp": {}
            },
            "Tty": true,
            "OpenStdin": true,
            "StdinOnce": false,
            "Env": [
                "DB_USER=u_42d814d7",
                "STORE_ID=42d814d7-fa6f-4cc5-adf4-9bdae39fba88",
                "DB_PORT=5432",
                "REDIS_PORT=6379",
                "VOLUME_SOURCE=/volumes/api/42d814d7",
                "USER_ID=1032",
                "DB_HOST=127.0.0.1",
                "NODE_ENV=production",
                "TZ=UTC",
                "USER_NAME=u_42d814d7",
                "CONTAINER_NAME=container_42d814d7",
                "STORE_NAME=STORE_NAME",
                "THEME_ID=THEME_ID",
                "PORT=3334",
                "BASE_ID=42d814d7",
                "APP_KEY=4IihbmaY6Fnj2Kf1uXSwWoAc3qA0jlFk",
                "DB_DATABASE=db_42d814d7",
                "VOLUME_TARGET=/volumes",
                "LOG_LEVEL=info",
                "EXTERNAL_PORT=0.0.0.0:4002",
                "DB_PASSWORD=w_42d814d7",
                "HOST=0.0.0.0",
                "REDIS_HOST=127.0.0.1",
                "REDIS_PASSWORD=redis_w",
                "GROUPE_NAME=g_42d814d7",
                "DOCKER_IMAGE=s_api:v1.0.0",
                "OWNER_ID=532e8ef8-ebb3-4951-915a-926a336da832",
                "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
                "NODE_VERSION=22.14.0",
                "YARN_VERSION=1.22.22"
            ],
            "Cmd": [
                "node",
                "ace",
                "serve"
            ],
            "Image": "s_api:v1.0.0",
            "Volumes": null,
            "WorkingDir": "/app",
            "Entrypoint": [
                "docker-entrypoint.sh"
            ],
            "OnBuild": null,
            "Labels": {}
        },
        "NetworkSettings": {
            "Bridge": "",
            "SandboxID": "561bfcfd23691e622eb70462ba3fdc7bf77366ba992b2819abee3e8e57a0260d",
            "SandboxKey": "/var/run/docker/netns/561bfcfd2369",
            "Ports": {
                "3334/tcp": [
                    {
                        "HostIp": "0.0.0.0",
                        "HostPort": "4002"
                    }
                ]
            },
            "HairpinMode": false,
            "LinkLocalIPv6Address": "",
            "LinkLocalIPv6PrefixLen": 0,
            "SecondaryIPAddresses": null,
            "SecondaryIPv6Addresses": null,
            "EndpointID": "528ee6eeedf47525dc99748b2171e5c58dc4f1cae12b82c5bf85dd657d73670c",
            "Gateway": "172.17.0.1",
            "GlobalIPv6Address": "",
            "GlobalIPv6PrefixLen": 0,
            "IPAddress": "172.17.0.4",
            "IPPrefixLen": 16,
            "IPv6Gateway": "",
            "MacAddress": "66:8e:a8:00:19:e6",
            "Networks": {
                "bridge": {
                    "IPAMConfig": null,
                    "Links": null,
                    "Aliases": null,
                    "MacAddress": "66:8e:a8:00:19:e6",
                    "DriverOpts": null,
                    "GwPriority": 0,
                    "NetworkID": "6b174e27c548a96ac7ca6094b4366d6ac460adf528fee0ecf01dd9d6036dc543",
                    "EndpointID": "528ee6eeedf47525dc99748b2171e5c58dc4f1cae12b82c5bf85dd657d73670c",
                    "Gateway": "172.17.0.1",
                    "IPAddress": "172.17.0.4",
                    "IPPrefixLen": 16,
                    "IPv6Gateway": "",
                    "GlobalIPv6Address": "",
                    "GlobalIPv6PrefixLen": 0,
                    "DNSNames": null
                }
            }
        }
    }
]
