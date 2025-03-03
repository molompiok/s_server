import { Logs } from '#controllers/Utils/functions'
import { Queue, Worker } from 'bullmq'
import { EventEmitter } from 'node:events'
export { createRedisChanel, sendByRedis, closeRedisChanel,RedisEmitter}

const redisMap = {} as Record<string, { queue: Queue<any, any, string, any, any, string>, worker: Worker<any, any, string> }>
const RedisEmitter = new EventEmitter();

async function createRedisChanel(BASE_ID: string) {
    const logs = new Logs(createRedisChanel)
    try {
        const queue = new Queue(`service_${BASE_ID}`, {
            connection: {
                host: '127.0.0.1',
                port: 6379,
            },
        })

        const worker = new Worker(
            `server_${BASE_ID}`,
            async (job) => {
                RedisEmitter.emit(`${BASE_ID}:${job.data.event}`,job.data.data)
                RedisEmitter.emit(`${BASE_ID}`,job.data)
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
        if(!redisMap[BASE_ID]){
            await createRedisChanel(BASE_ID);
        }
        await redisMap[BASE_ID].queue.add(`service_${BASE_ID}`, data);
    } catch (error) {
        return logs.logErrors(`❌ Erreur lors de l'envois dans  RedisChanel BASE_ID=${BASE_ID} :`, error);
    }
}

async function closeRedisChanel(BASE_ID: string) {
    const logs = new Logs(closeRedisChanel);
    try {
        await redisMap[BASE_ID]?.queue.close();
        await redisMap[BASE_ID]?.worker.close();
    } catch (error) {
        return logs.logErrors(`❌ Erreur lors de la fermeture de RedisChanel BASE_ID=${BASE_ID} :`, error);
    }
}


