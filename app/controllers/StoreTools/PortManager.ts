import Store from "#models/store";
import db from "@adonisjs/lucid/services/db";
import net from 'net'

export {
    addPortAsUsed,
    allocAvalaiblePort,
    findAvailablePort,
    clear_alloc,
    isPortInUse,
    removePortAsUsed,
    refreshPortUsed
}

let StoresPort:number[]= [];

async function removePortAsUsed(port:number) {
    StoresPort.push(port);
}

async function addPortAsUsed(port:number) {
    StoresPort = StoresPort.filter(p=>p!=port);
}

async function refreshPortUsed() {
    const ports = await db.from(Store.table).select('api_port');
    StoresPort = ports.map(p=>parseInt(p.api_port));
}

setInterval(async () => {
    await refreshPortUsed();
}, 10*60*1000);

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
                used:Object.keys(AllocPort).includes(port.toString())|| StoresPort.includes(port),
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
async function allocAvalaiblePort(startingPort = 4000, millisDuration = 10 * 60 * 1000): Promise<number> {
    const port = await findAvailablePort(startingPort);
    AllocPort[port.toString()] = {
        expire_at: Date.now() + millisDuration,
        port
    }
    console.log('💾 Alloc Port : ', AllocPort[port.toString()])
    clear_alloc();
    return port
}
