//app/Utils/functions.ts
import env from "#start/env";
import { execa } from "execa";
import { v4 } from "uuid";

export { waitHere, serviceNameSpace, Logs, writeFile, newContainerName, requiredCall }


export const isProd = env.get('NODE_ENV') =='production'
export const http = isProd ? 'https://' : 'http://'
export const devIp = '172.25.72.235'

async function waitHere(millis: number) {
  await new Promise((rev) => setTimeout(() => rev(0), millis))
}


function serviceNameSpace(store_id: string) {
  const BASE_ID = store_id.split('-')[0];
  return {
    USER_NAME: `u_${BASE_ID}`,
    GROUPE_NAME: `g_${BASE_ID}`,
    DB_DATABASE: `db_${BASE_ID}`,
    DB_PASSWORD: `w_${BASE_ID}`,
    BASE_ID,
    CONTAINER_NAME: `container_${BASE_ID}`,
    VOLUME_SOURCE: `${env.get('S_API_VOLUME_SOURCE_BASE_IN_S_SERVER')}/${store_id}`,
    VOLUME_TARGET: env.get('S_API_VOLUME_TARGET_IN_S_API_CONTAINER'),
  }
}

function newContainerName(info: { lastName?: string, store_id?: string }) {
  const diff_id = `${v4().split('-')[0]}`
  return info.store_id ?
    `container_${info.store_id.split('-')[0]}_${diff_id}` :
    `${info.lastName?.split('_').slice(0, 2).join('_')}_${diff_id}`
}


async function writeFile(path: string, content: string) {
  const logs = new Logs(writeFile);

  try {
    // Vérification des permissions (sudo n'est peut-être pas nécessaire)
    await execa('sudo', ['tee', path], { input: content });
    logs.log(`✅ Écriture du fichier terminée: ${path}`);
  } catch (error) {
    logs.notifyErrors(`❌ Erreur pendant l'écriture du fichier`, { path, content }, error);
    throw error; // Propager l'erreur pour une meilleure gestion en amont
  }

  return logs;
}


const MapFunctionDelay: any = {}
async function requiredCall<T>(fn: (...args: any[]) => T, ...params: any[]) {
  MapFunctionDelay[fn.name] || (MapFunctionDelay[fn.name] = {});
  MapFunctionDelay[fn.name].fn = fn;
  MapFunctionDelay[fn.name].params = params || [];
  MapFunctionDelay[fn.name].needCall = true;
  if ((MapFunctionDelay[fn.name]?.nextTime || 0) > Date.now()) {
    return;
  }

  // sinon on appelle la fonction avec les params presentes, et on suprmis les params 
  // on lance un time out  pour le prochain appele 
  // si au prochain appelle il ya pas de params on n'appelle pas la fonction et c'est fini
  const launch = () => {
    if (MapFunctionDelay[fn.name].needCall) {
      MapFunctionDelay[fn.name].needCall = false;
      const nextTime = Date.now() + 500;
      MapFunctionDelay[fn.name].nextTime = nextTime;
      MapFunctionDelay[fn.name].id = setTimeout(() => {
        launch();
      }, 2000);
      const r = MapFunctionDelay[fn.name].fn?.(...MapFunctionDelay[fn.name].params);
      MapFunctionDelay[fn.name].params = [];
      return r
    }
  }
  clearTimeout(MapFunctionDelay[fn.name].id)
  return launch() as T;
}


class Logs {
  static DEFAULT_NAME = '[No Name Function]';
  ok = true
  errors = [] as any[]
  result = undefined as any
  name = Logs.DEFAULT_NAME
  constructor(fn?: Function|string, logs?: { ok?: boolean, errors?: any[] }) {
    this.errors = logs?.errors ?? [];
    this.ok = logs?.ok ?? true;
    this.name = typeof fn == 'string'? fn : fn?.name || Logs.DEFAULT_NAME
  }

  log(...errors: any[]) {
    console.log(...errors);
    return this
  }

  logErrors(...errors: any[]) {
    this.errors.push(...errors);
    console.error(...errors);
    this.ok = false
    return this
  }
  notify(...errors: any[]) {
    console.error(...errors);
    //TODO notify admin sse, write in file date.logs
    return this
  }
  notifyErrors(...errors: any[]) {
    this.errors.push(...errors);
    console.error(...errors);
    this.ok = false
    return this
  }
  asOk() {
    this.ok = true;
    return this
  }
  asNotOk() {
    this.ok = false;
    return this
  }
  merge(logs: Logs, impact = true) {
    this.ok = impact ? (logs.ok && this.ok) : this.ok;
    this.errors.push(...logs.errors);
    return logs
  }

  fork(name:string){
    return new Logs(name);
  }

  return(result: any) {
    this.result = result
    return this
  }
}