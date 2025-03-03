

export {DEFAULT_ENV,type REQUIRED_STORE_ENV}

const DEFAULT_ENV = {
    TZ: 'UTC',
    HOST: '0.0.0.0',
    LOG_LEVEL: 'info',
    APP_KEY: '4IihbmaY6Fnj2Kf1uXSwWoAc3qA0jlFk',// TODO get api_key// l'utiliter et l'usage
    NODE_ENV: 'production',
    DB_HOST: '127.0.0.1',
    DB_PORT: '5432',
    REDIS_HOST: '127.0.0.1',
    REDIS_PORT: '6379',
    REDIS_PASSWORD: 'redis_w',
    PORT: '3334',
    DOCKER_IMAGE: 's_api:v1.0.0', //TODO getCurrentApiVerssion()
    STORE_NAME: 'STORE_NAME',
    THEME_ID: 'THEME_ID'
  }


  type REQUIRED_STORE_ENV = {
      SERVICE_ID: string,
      BASE_ID: string,
      OWNER_ID: string,
      TZ?: string,
      HOST: string,
      LOG_LEVEL?: string,
      APP_KEY?: string,
      NODE_ENV?: string,
      DB_USER: string,
      DB_HOST?: string,
      DB_PORT?: string,
      DB_PASSWORD: string,
      DB_DATABASE?: string,
      REDIS_HOST?: string,
      REDIS_PORT?: string,
      REDIS_PASSWORD?: string,
      GROUPE_NAME: string,
      PORT: string,
      EXTERNAL_PORT: string,
      USER_NAME: string,
      DOCKER_IMAGE: string,
      VOLUME_TARGET: string,
      VOLUME_SOURCE: string,
      CONTAINER_NAME: string,
      STORE_NAME?: string, //TODO a suprimer
      THEME_ID?: string//TODO a suprimer
  }