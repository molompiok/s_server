

export {DEFAULT_ENV}

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