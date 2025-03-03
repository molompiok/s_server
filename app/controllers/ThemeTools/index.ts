import env from "#start/env";
import { delete_service_requied, runServiceInstance, } from "../StoreTools/Docker.js";
import { multipleTestDockerInstanceEnv } from "../StoreTools/Teste.js";
import { Logs, serviceNameSpace } from "#controllers/Utils/functions";
import { closeRedisChanel } from "../StoreTools/RedisBidirectional.js";
import { HOST_PORT } from "#controllers/Utils/Interfaces";
import { allocAvalaiblePort } from "../StoreTools/PortManager.js";
import { inpectAppDirs } from "../StoreTools/GarbageCollector.js";
import Theme from "#models/theme";
import { updateNginxServer } from "#controllers/StoreTools/Nginx";

export { runTheme, restartTheme, stopTheme, deleteTheme }


//TODO tranformer le run new tore un run theme // il create les instance non existantes
//    et fera les veruification a chaque niveau
//    un argument newRequied pour etre passer pour cree un nouveaux theme ou allerter a la moindre error concurente

async function runTheme(theme: Theme, host_port?: HOST_PORT) {
  const logs = new Logs(runTheme);
  let h_p = host_port || await allocAvalaiblePort();
  const nameSpace = serviceNameSpace(theme.id)
  let theme_env = {
    EXTERNAL_PORT: `${h_p.host}:${h_p.port}`,
    DOCKER_IMAGE:theme.version,
    HOST:env.get('HOST'),
    PORT:theme.internal_port,
    SERVICE_ID:theme.id,
    REDIS_HOST:env.get('REDIS_HOST'),
    REDIS_PASSWORD:env.get('REDIS_PASSWORD'),
    REDIS_PORT:env.get('REDIS_PORT'),
    ...nameSpace,
  }
  const runLogs = await runServiceInstance(theme_env);
  logs.merge(runLogs);
  if (!logs.ok) return logs
  if (runLogs.result) {

    theme_env = runLogs.result;

    h_p = {
      ...h_p,
      port: runLogs.result.EXTERNAL_PORT?.split(':')[1] || h_p.port,
      host: runLogs.result.HOST || h_p.host
    }
  }

  const testUrl = `http://${h_p.host}:${h_p.port}/`;

  logs.merge(await multipleTestDockerInstanceEnv({
    envMap: theme_env,
    interval: env.get('TEST_API_INTERVAL'),
    max_tentative: env.get('TEST_API_MAX_TENTATIVE'),
    url: testUrl
  }));

  if (!logs.ok) return logs;
  await updateNginxServer();
//   await updateRedisHostPort(theme.id, (h_ps) => [...h_ps, h_p])
  // logs.log(`🔍🔍🔍 getRedisHostPort`,await getRedisHostPort(theme.id))
  // logs.log(`🔍🔍🔍 getRedisStore`,await getRedisStore(theme.id))
//   logs.merge(await updateNginxStoreDomaine(theme));

  return logs
}

async function stopTheme(theme: Theme) {
  return await delete_service_requied(serviceNameSpace(theme.id).CONTAINER_NAME);
}

async function restartTheme(theme: Theme) {
  const logs  = await delete_service_requied(serviceNameSpace(theme.id).CONTAINER_NAME);
  logs.merge(await runTheme(theme))
  return logs
}

// async function testTheme(theme: Theme) {
//   const apiSlashUrl = `http://${env.get('SERVER_DOMAINE')}/${theme.name}`;
//   const theme_env = serviceNameSpace(theme.id)
//   return await multipleTestDockerInstanceEnv({
//     envMap: theme_env,
//     interval: env.get('TEST_API_INTERVAL'),
//     max_tentative: env.get('TEST_API_MAX_TENTATIVE'),
//     url: apiSlashUrl
//   })
// }

async function deleteTheme(theme: Theme) {
  const {
    CONTAINER_NAME,
    BASE_ID
  } = serviceNameSpace(theme.id);

  await inpectAppDirs();
  await delete_service_requied(CONTAINER_NAME /* Api Name */);
  await closeRedisChanel(BASE_ID);
  await updateNginxServer();
}

// async function runAllActiveStoreService<T extends { DOCKER_IMAGE: string, PORT: string }>(envRequied: T) {
//     const themes = await Store.all();
//     const logs = new Logs(runAllActiveStoreService);
//     for (const theme of themes) {

//         const nameSpace = serviceNameSpace(theme.id);
//         const host_port = await allocAvalaiblePort()
//         logs.merge(await runServiceInstance({
//             ...nameSpace,
//             ...envRequied,
//             EXTERNAL_PORT: `${host_port.host}:${host_port.port}`,
//             STORE_ID: theme.id,
//             OWNER_ID: theme.user_id,
//             HOST: '0.0.0.0',
//             NODE_ENV: 'production',
//             DB_USER: nameSpace.USER_NAME,
//             DOCKER_IMAGE: 's_service:v1.0.0', // donner par l'service
//             STORE_NAME: 'STORE_NAME',
//             THEME_ID: 'THEME_ID'
//         }))
//     }
//     return logs
// }