import { HOST_PORT } from '#controllers/Utils/Interfaces';
import env from '#start/env';
import net from 'net'

export {
    allocAvalaiblePort,
    findAvailablePort,
    clear_alloc,
    isPortInUse,
    allocPort
}

async function isPortInUse(port: number): Promise<{used:boolean,port:number}> {
    return new Promise((resolve) => {
        const server = net.createServer();
        server.once('error', () => {
            // Port utilisé
            server.close();
            resolve({used:true,port});
        }) 
        server.once('listening', () => {
            server.close();
            resolve({
                used:Object.keys(AllocPort).includes(port.toString()),
                port
            });
            // 
        })
        server.listen(port);

    })
}

type AllocPortInfo = {
    port: number,
    expire_at: number,
}

function clear_alloc() {
    if ((clear_alloc as any).isClearning) {
        return
    }

    (clear_alloc as any).isClearning = true;
    
    const id = setInterval(() => {
        const ports = Object.values(AllocPort);
        ports.forEach(p => {
            if (p.expire_at < Date.now()) {
                console.log('💀 Delete Alloc ', AllocPort[p.toString()])
                delete AllocPort[p.port.toString()]
            }
        })
        if (Object.keys(AllocPort).length <= 0) {
            clearInterval(id);
            (clear_alloc as any).isClearning = false;
            console.log('❌👍 Plus D\'allocation')
        }
    }, 60 * 1000);

}

const AllocPort = {} as Record<string, AllocPortInfo>;

//TODO augmenter le nombre de port, currant limit 50_000
async function findAvailablePort(startingPort = 4000): Promise<number> {
    let port = startingPort;
    // const limit = 50_000;
    let availablePort = false;
    const step = 100;
    while (!availablePort) {
        const promises = Array.from({length:step}).map(()=>{
            return isPortInUse(port++);
        });

        const lists = (await Promise.allSettled(promises)).map(v=>(v as any).value as {port:number,used:boolean});
        for (const p of lists) {
            if(p.used) continue;
            return p.port;
        }
    }
    
    return port
}
async function allocPort(port:number,millisDuration = 10 * 60 * 1000) {
    AllocPort[port.toString()] = {
        expire_at: Date.now() + millisDuration,
        port
    }
    console.log('💾 Alloc Port : ', AllocPort[port.toString()])
    clear_alloc();
    return {
        port,
        host:env.get('HOST')
    }
}

async function allocAvalaiblePort(startingPort = 4000, millisDuration = 10 * 60 * 1000) {
    const port = await findAvailablePort(startingPort);
    AllocPort[port.toString()] = {
        expire_at: Date.now() + millisDuration,
        port
    }
    console.log('💾 Alloc Port : ', AllocPort[port.toString()])
    clear_alloc();
    return {
        port,
        host:env.get('HOST'),
        date:Date.now(),
        weight:1
    } as HOST_PORT
}
