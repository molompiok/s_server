import si from 'systeminformation';

async function test() {
    try {
        const cpu = await si.currentLoad();
        console.log('CPU Load:', cpu.currentLoad);

        const mem = await si.mem();
        console.log('Memory Active:', mem.active, 'Total:', mem.total);

        const disk = await si.fsSize();
        const root = disk.find(d => d.mount === '/');
        console.log('Root Disk Use:', root ? root.use : 'Not found');

        const temp = await si.cpuTemperature();
        console.log('Temp Main:', temp.main);

    } catch (error) {
        console.error('Error:', error);
    }
}

test();
