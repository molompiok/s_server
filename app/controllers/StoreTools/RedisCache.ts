import { HOST_PORT } from '#controllers/Utils/Interfaces';
import Store from '#models/store'
import Redis from 'ioredis'

export {
    setCache,
    getCache,
    deleteCache,
    setRedisStore,
    getRedisStore,
    getRedisStoreByName,
    setRedisHostPort,
    getRedisHostPort,
    getRedisStoreHostPortByName,
    deleteRedisHostPort,
    deleteRedisStore,
    updateRedisHostPort
}

// Création d'une connexion Redis
//@ts-ignore
const redis = new Redis({
    host: '0.0.0.0',
    port: 6379,
});


/*****************   STORE CACHE FUNCTIONS    ***************** */

async function setRedisStore(store: Store, lastName: string) {
    
    lastName && deleteCache(lastName)
    await setCache(store.id, store.$attributes)
    await setCache(store.name, store.id)

}

async function getRedisStore(store_id: string) {
    return await getCache(store_id);
}

async function getRedisStoreByName(store_name: string) {
    const store_id = await getCache(store_name);
    return await getCache(store_id);
}

async function deleteRedisStore(store: Store) {
    await deleteCache(store.id)
}

/*****************   HOST_POST CACHE FUNCTIONS    ***************** */

async function setRedisHostPort(id: string, h_p: HOST_PORT[]) {
    await setCache(`h_p_${id}`, h_p);
}

async function updateRedisHostPort(id: string, update :(h_ps: HOST_PORT[]) => HOST_PORT[]) {
    const newH_ps = update(await getRedisHostPort(id))
    await setCache(`h_p_${id}`, newH_ps);
}

async function getRedisHostPort(id:string) {
    return  (await getCache(`h_p_${id}`)||[]) as HOST_PORT[]
}

async function getRedisStoreHostPortByName(store_name:string) {
   const id = await getCache(store_name);
   return await getRedisHostPort(id);
}

async function deleteRedisHostPort(id: string) {
    await deleteCache(id)
}

/*****************   DEFAULT CACHE FUNCTIONS    ***************** */

async function setCache(key: string, value: any, ttl = 3600) {
    await redis.set(key, JSON.stringify(value), 'EX', ttl)
}

async function getCache(key: string, _default?: any) {
    const data = await redis.get(key)
    try {
        return data ? JSON.parse(data) : null
    } catch (error) {
        return _default||null
    }
}

async function deleteCache(key: string) {
    await redis.del(key)
}

// Fermeture propre de la connexion Redis en cas d'arrêt du serveur
process.on('SIGINT', async () => {
    console.log('Fermeture de Redis...')
    await redis.quit()
    process.exit(0)
})

