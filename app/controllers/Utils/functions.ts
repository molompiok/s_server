import env from "#start/env";

export { waitHere, storeNameSpace, Logs }


async function waitHere(time: number) {
  await new Promise((rev) => setTimeout(() => rev(0), time))
}


function storeNameSpace(store_id: string) {
  const BASE_ID = store_id.split('-')[0];
  return {
    USER_NAME: `u_${BASE_ID}`,
    GROUPE_NAME: `g_${BASE_ID}`,
    DB_DATABASE: `db_${BASE_ID}`,
    DB_PASSWORD: `w_${BASE_ID}`,
    BASE_ID,
    CONTAINER_NAME: `container_${BASE_ID}`,
    VOLUME_SOURCE: `${env.get('S_API_VOLUME_SOURCE')}/${BASE_ID}`,
    VOLUME_TARGET: env.get('S_API_VOLUME_TARGET'),
  }
}


class Logs {
  static DEFAULT_NAME = '[No Name Function]';
  ok = true
  errors = [] as any[]
  result = undefined as any
  name = Logs.DEFAULT_NAME
  constructor(fn?: Function,logs?:{ok?: boolean, errors?: any[]} ) {
    this.errors = logs?.errors ?? [];
    this.ok = logs?.ok ?? true;
    this.name = fn?.name||Logs.DEFAULT_NAME
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
  asOk(){
    this.ok = true;
    return this
  }
  asNotOk(){
    this.ok = false;
    return this
  }
  merge(logs: Logs, impact = true) {
    this.ok = impact ? (logs.ok && this.ok) : this.ok;
    this.errors.push(...logs.errors);
    return logs
  }

  return(result:any){
    this.result = result
    return this
  }
}