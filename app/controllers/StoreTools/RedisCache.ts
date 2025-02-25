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
    getRedisHostPortByName,
    deleteRedisHostPort,
    deleteRedisStore
}

// Création d'une connexion Redis
//@ts-ignore
const redis = new Redis({
    host: '0.0.0.0',
    port: 6379,
});


/*****************   STORE CACHE FUNCTIONS    ***************** */

async function setRedisStore(store: Store, lastName: string) {

    await setCache(store.id, store.$attributes)
    await setCache(store.name, store.id)

    lastName && deleteCache(lastName)
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

async function setRedisHostPort(store_id: string, h_p: HOST_PORT[]) {
    await setCache(`h_p_${store_id}`, h_p);
}

async function getRedisHostPort(store_id:string) {
    return  await getCache(`h_p_${store_id}`)
}

async function getRedisHostPortByName(store_name:string) {
   const store_id = await getCache(store_name);
   return await getRedisHostPort(store_id)
}

async function deleteRedisHostPort(store: Store) {
    await deleteCache(store.id)
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

