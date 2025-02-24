import Store from "#models/store";
import env from "#start/env";
import { createDatabase, deleteDatabase } from "./DataBase.js";
import { deleteDockerContainer, reloadDockerContainer, runDockerInstance, startDockerInstance, stopDockerInstance } from "./Docker.js";
import { configVolumePermission, deletePermissions, removeVolume } from "./Permission_Volume.js";
import { multipleTestDockerInstavecEnv } from "./Teste.js";
import { Logs, storeNameSpace } from "#controllers/Utils/functions";
import { removeNginxDomaine, updateNginxServer } from "./Nginx.js";
import { closeRedisChanel } from "./Redis.js";

export { runNewStore, deleteStore, startStore, stopStore, reloadStore ,testStore}


//TODO tranformer le run new tore un run store // il create les instance non existantes
//    et fera les veruification a chaque niveau
//    un argument newRequied pour etre passer pour cree un nouveaux store ou allerter a la moindre error concurente

async function runNewStore(store: Store) {
  const logs = new Logs(runNewStore);

  const nameSpaces = storeNameSpace(store.id)
  const {
    BASE_ID,
    CONTAINER_NAME,
    DB_DATABASE,
    DB_PASSWORD,
    GROUPE_NAME,
    USER_NAME,
    VOLUME_SOURCE,
    VOLUME_TARGET,
  } = nameSpaces;

  logs.merge(await configVolumePermission({ USER_NAME, VOLUME_SOURCE, GROUPE_NAME }));
  logs.merge(await createDatabase({ DB_DATABASE, USER_NAME, DB_PASSWORD })) ;

  const store_env = {
    STORE_ID: store.id,
    BASE_ID,
    OWNER_ID: store.user_id,

    TZ: 'UTC',
    HOST: '0.0.0.0',
    LOG_LEVEL: 'info',
    APP_KEY: '4IihbmaY6Fnj2Kf1uXSwWoAc3qA0jlFk',
    NODE_ENV: 'production',

    DB_USER: USER_NAME,
    DB_HOST: '127.0.0.1',
    DB_PORT: '5432',
    DB_PASSWORD,
    DB_DATABASE,

    REDIS_HOST: '127.0.0.1',
    REDIS_PORT: '6379',
    REDIS_PASSWORD: 'redis_w',

    PORT: '3334',
    EXTERNAL_PORT: store.api_port.toString(),
    USER_NAME,
    DOCKER_IMAGE: 's_api:v1.0.5', // donner par l'api
    VOLUME_TARGET,
    VOLUME_SOURCE,
    CONTAINER_NAME,
    STORE_NAME:'STORE_NAME',
    THEME_ID:'THEME_ID'
    // GOOGLE_CLIENT_ID:'lol',
    // GOOGLE_CLIENT_SECRET:'lol',
    // FILE_STORAGE_PATH:'./ fs',
    // FILE_STORAGE_URL:'/fs'
  }
  logs.merge(await runDockerInstance(store_env));
  const testUrl = `http://${env.get('HOST')}:${store.api_port}/`;
  logs.merge( await multipleTestDockerInstavecEnv({
    envMap: store_env,
    interval: env.get('TEST_API_INTERVAL'),
    max_tentative: env.get('TEST_API_MAX_TENTATIVE'),
    url: testUrl
  }));
  let apiUrlTest
  
  if (logs.ok) {
    logs.log(`📌  Creation Des fichier de configuration nginx`)
    logs.merge(await updateNginxServer());
    const apiSlashUrl = `http://${env.get('SERVER_DOMAINE')}/${store.name}`;
     apiUrlTest = await multipleTestDockerInstavecEnv({
      envMap: store_env,
      interval: env.get('TEST_API_INTERVAL'),
      max_tentative: env.get('TEST_API_MAX_TENTATIVE'),
      url: apiSlashUrl
    })
    logs.merge(apiUrlTest)
  }
  return logs
}

async function stopStore(store: Store) {
 return await stopDockerInstance(storeNameSpace(store.id).CONTAINER_NAME);
}
async function startStore(store: Store) {
  return await startDockerInstance(storeNameSpace(store.id).CONTAINER_NAME);
}
async function reloadStore(store: Store) {
  return await reloadDockerContainer(storeNameSpace(store.id).CONTAINER_NAME)
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
    CONTAINER_NAME,
    VOLUME_SOURCE,
    DB_DATABASE,
    GROUPE_NAME,
    USER_NAME,
    BASE_ID
  } = storeNameSpace(store.id);

  await deleteDockerContainer(CONTAINER_NAME);
  await removeVolume(VOLUME_SOURCE);
  await deleteDatabase(DB_DATABASE);
  await closeRedisChanel(BASE_ID);
  await deletePermissions({ groups: [GROUPE_NAME], users: [USER_NAME] });
  await removeNginxDomaine(BASE_ID);
  await updateNginxServer()
}