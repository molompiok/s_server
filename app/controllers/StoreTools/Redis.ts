import { Logs } from '#controllers/Utils/functions'
import { Queue, Worker } from 'bullmq'


export { createRedisChanel, sendByRedis, closeRedisChanel}

const redisMap = {} as Record<string, { queue: Queue<any, any, string, any, any, string>, worker: Worker<any, any, string> }>

async function createRedisChanel(BASE_ID: string) {
    const logs = new Logs(createRedisChanel)
    try {
        const queue = new Queue(`api:${BASE_ID}`, {
            connection: {
                host: '127.0.0.1',
                port: 6379,
            },
        })

        const worker = new Worker(
            `server:${BASE_ID}`,
            async (job) => {
                console.log('Processing job:', job.data)
                // Traitement des données...
            },
            {
                connection: {
                    host: '127.0.0.1',
                    port: 6379,
                },
            }
        )
        return logs.return(
            redisMap[BASE_ID] = {
                queue,
                worker
            })
    } catch (error) {
        return logs.logErrors(`❌ Erreur lors de la creation de RedisChanel BASE_ID=${BASE_ID} :`, error)
    }

}

async function sendByRedis(BASE_ID: string, data: Record<string, any>) {
    const logs = new Logs(sendByRedis);
    try {
        await redisMap[BASE_ID].queue.add(`api:${BASE_ID}`, data);
    } catch (error) {
        return logs.logErrors(`❌ Erreur lors de l'envois dans  RedisChanel BASE_ID=${BASE_ID} :`, error);
    }
}

async function closeRedisChanel(BASE_ID: string) {
    const logs = new Logs(closeRedisChanel);
    try {
        await redisMap[BASE_ID].queue.close();
        await redisMap[BASE_ID].worker.close();
    } catch (error) {
        return logs.logErrors(`❌ Erreur lors de la fermeture de RedisChanel BASE_ID=${BASE_ID} :`, error);
    }
}