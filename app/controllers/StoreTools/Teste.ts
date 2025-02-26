import { Logs, waitHere } from "#controllers/Utils/functions";
import { execa } from "execa";
import { getRedisHostPort, getRedisStore, getRedisStoreByName, getRedisStoreHostPortByName } from '#controllers/StoreTools/RedisCache';

export { multipleTestDockerInstavecEnv, testDockerInstanceEnv, isDockerRuning, testRedis }
/*

1=> Création de l'utilisateur: u_9a1d1662 :-> id u_9a1d1662 #=> true
2=>  Création de l'utilisateur: u_9a1d1662 :->  getent group g_9a1d1662 #=> (g_9a1d1662:x:1005:u_9a1d1662,server_user,noga).include('server_user','vps_user',api_user) 
3=> Creation du VOLUME_SOURCE :=> cd /volumes/api/9a1d1662 #=>
4=> Création de l'utilisateur PostgreSQL : u_9a1d1662/api_user
    Création de la base de données : db_9a1d1662
    Attribution des permissions
  => sudo -u postgres psql -l => includes (api_user,db_name) sur la meme ligne
5=> Instance Docker container_ec4413b6 lancée => multi test curl http://host:port
    */
async function isDockerRuning(ip_port: string) {
  try {
    const log = await execa('curl', [ip_port]);
    if (log.failed) return false

  } catch (error) {
    return false
  }
  return true;
}

async function testDockerInstanceEnv({ url, envMap, showOut }: { showOut?: boolean, url: string, envMap: Record<string, string> }): Promise<Record<string, string> | undefined> {
  console.log(`🔹 TEST DE DOCKER INSTANCE a d'address : '${url}`)
  let stdout = ''
  try {
    const log = await execa('curl', [url])
    if (log.failed) {
      console.error(`❌ Error lors l'appel a l'URL : ${url}`, log.shortMessage)
      return { _error: '' }
    }
    stdout = log.stdout;
    if (showOut) {
      console.log(log.stdio);
    }
  } catch (error) {
    console.error(`❌ Error lors l'appel a l'URL : ${url}`, error.message)
  }

  try {

    const dataEnv = JSON.parse(stdout);
    const dataKeyLength = Object.keys(dataEnv).length
    const enMapLength = Object.keys(envMap).length

    if (dataKeyLength < enMapLength) {
      console.error(`❌ Data receving is not complet`, { enMapLength, dataKeyLength })
      return { _error: '' }
    }

    const badKeys = {} as any;
    Object.keys(envMap).forEach(k => {
      (dataEnv[k] != envMap[k])
        &&
        (
          badKeys[k] = {
            env: envMap[k],
            badEnv: dataEnv[k]
          }
        )
      // console.log(`🔹 Test env => ${k}:${badKeys[k] || envMap[k]}`);
    }
    );
    return Object.keys(badKeys).length > 0 ? badKeys : undefined
  } catch (error) {
    console.error(`❌ Error env is not a json`, error.message)
    return { _error: '' }
  }
}

async function multipleTestDockerInstavecEnv({ max_tentative, interval, url, envMap }: { max_tentative: number, interval: number, url: string, envMap: Record<string, string> }) {
  const logs = new Logs(multipleTestDockerInstavecEnv)
  let badKeys;
  for (let i = 0; i < parseInt(max_tentative.toString()); i++) {
    logs.log(`${i == 0 ? '🚀' : '🔄'} Test de l'api ${url} : ${i + 1}`);
    badKeys = await testDockerInstanceEnv({ url, envMap, showOut: i == 0 });
    console.log({ badKeys });

    if (badKeys) {
      await waitHere(parseInt(interval.toString()));
    } else {
      return logs.log(`✅ Le  store a passe les test a l'url : ${url}`).asOk()
    }

  }
  return logs.asNotOk()
}

async function testRedis(id: string) {
  // return
  let store = {}
  console.log("✨REDIS✨", {
    store: store = (await getRedisStore(id)) || {},
    storeByName: await getRedisStoreByName((store as any).name),
    storeHostPort: await getRedisHostPort(id),
    getRedisStoreHostPortByName: await getRedisStoreHostPortByName((store as any).name),
  });

}