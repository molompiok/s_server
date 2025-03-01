import Store from "#models/store";
import env from "#start/env";
import { createDatabase, deleteDatabase } from "./DataBase.js";
import { delete_api, delete_api_requied, runApiInstance, } from "./Docker.js";
import { configVolumePermission, deletePermissions, removeVolume } from "./Permission_Volume.js";
import { multipleTestDockerInstavecEnv } from "./Teste.js";
import { Logs, storeNameSpace } from "#controllers/Utils/functions";
import { removeNginxDomaine, updateNginxServer, updateNginxStoreDomaine } from "./Nginx.js";
import { closeRedisChanel } from "./RedisBidirectional.js";
import { HOST_PORT } from "#controllers/Utils/Interfaces";
import { getRedisHostPort, setRedisStore, updateRedisHostPort } from "./RedisCache.js";
import { allocAvalaiblePort, allocPort } from "./PortManager.js";
import { DEFAULT_ENV } from "#controllers/Utils/constantes";

export { runStoreApi, deleteStore, startStore, stopStore, reloadStore, testStore }


//TODO tranformer le run new tore un run store // il create les instance non existantes
//    et fera les veruification a chaque niveau
//    un argument newRequied pour etre passer pour cree un nouveaux store ou allerter a la moindre error concurente

async function runStoreApi(store: Store, host_port?: HOST_PORT) {
  const logs = new Logs(runStoreApi);
  let h_p = host_port || await allocAvalaiblePort()
  const nameSpaces = storeNameSpace(store.id)
  const {
    DB_DATABASE,
    DB_PASSWORD,
    GROUPE_NAME,
    USER_NAME,
    VOLUME_SOURCE,
  } = nameSpaces;

  logs.merge(await configVolumePermission({ USER_NAME, VOLUME_SOURCE, GROUPE_NAME }));
  if (!logs.ok) return logs

  logs.merge(await createDatabase({ DB_DATABASE, USER_NAME, DB_PASSWORD }));
  if (!logs.ok) return logs

  let store_env = {
    STORE_ID: store.id,
    OWNER_ID: store.user_id,
    DB_USER: USER_NAME,
    EXTERNAL_PORT: `${h_p.host}:${h_p.port}`,
    ...nameSpaces,
    ...DEFAULT_ENV
  }
  const runLogs = await runApiInstance(store_env);
  logs.merge(runLogs);
  if (!logs.ok) return logs
  if (runLogs.result) {

    store_env = runLogs.result;

    h_p = {
      ...h_p,
      port: runLogs.result.EXTERNAL_PORT?.split(':')[1] || h_p.port,
      host: runLogs.result.HOST || h_p.host
    }
  }

  const testUrl = `http://${h_p.host}:${h_p.port}/`;

  logs.merge(await multipleTestDockerInstavecEnv({
    envMap: store_env,
    interval: env.get('TEST_API_INTERVAL'),
    max_tentative: env.get('TEST_API_MAX_TENTATIVE'),
    url: testUrl
  }));
  let apiUrlTest

  if (!logs.ok) return logs;
  logs.log(`📌  Mise en cache du port Redis `)
  await setRedisStore(store, '');
  await updateRedisHostPort(store.id, (h_ps) => [...h_ps, h_p])
  // logs.log(`🔍🔍🔍 getRedisHostPort`,await getRedisHostPort(store.id))
  // logs.log(`🔍🔍🔍 getRedisStore`,await getRedisStore(store.id))
  await updateNginxServer()
  logs.merge(await updateNginxStoreDomaine(store));
  const apiSlashUrl = `http://${env.get('SERVER_DOMAINE')}/${store.name}`;
  apiUrlTest = await multipleTestDockerInstavecEnv({
    envMap: store_env,
    interval: env.get('TEST_API_INTERVAL'),
    max_tentative: env.get('TEST_API_MAX_TENTATIVE'),
    url: apiSlashUrl
  });
  logs.merge(apiUrlTest)

  return logs
}

async function stopStore(store: Store) {
  return await delete_api_requied(storeNameSpace(store.id).CONTAINER_NAME);
}
async function startStore(store: Store, host_port?: HOST_PORT) {
  return await runStoreApi(store,host_port);
}
async function reloadStore(store: Store) {
  const logs  = await delete_api_requied(storeNameSpace(store.id).CONTAINER_NAME);
  console.log({logs});
  
  logs.merge(await runStoreApi(store))
  return logs
}

async function testStore(store: Store) {
  const apiSlashUrl = `http://${env.get('SERVER_DOMAINE')}/${store.name}`;
  const store_env = storeNameSpace(store.id)
  return await multipleTestDockerInstavecEnv({
    envMap: store_env,
    interval: env.get('TEST_API_INTERVAL'),
    max_tentative: env.get('TEST_API_MAX_TENTATIVE'),
    url: apiSlashUrl
  })
}

async function deleteStore(store: Store) {
  const {
    CONTAINER_NAME, //TODO changer le container_name en api name
    VOLUME_SOURCE,
    DB_DATABASE,
    GROUPE_NAME,
    USER_NAME,
    BASE_ID
  } = storeNameSpace(store.id);

  await delete_api(CONTAINER_NAME /* Api Name */);
  await removeVolume(VOLUME_SOURCE);
  await deleteDatabase(DB_DATABASE);
  await closeRedisChanel(BASE_ID);
  await deletePermissions({ groups: [GROUPE_NAME], users: [USER_NAME] });
  await removeNginxDomaine(BASE_ID);
  await updateNginxServer()
}