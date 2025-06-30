/*
|--------------------------------------------------------------------------
| Environment variables service
|--------------------------------------------------------------------------
|
| The `Env.create` method creates an instance of the Env service. The
| service validates the environment variables and also cast values
| to JavaScript data types.
|
*/

import { Env } from '@adonisjs/core/env'

export default await Env.create(new URL('../', import.meta.url), {
  NODE_ENV: Env.schema.enum(['development', 'production', 'test'] as const),
  PORT: Env.schema.number(),
  APP_KEY: Env.schema.string(),
  HOST: Env.schema.string(),
  LOG_LEVEL: Env.schema.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']),

  /*
  |----------------------------------------------------------
  | Variables for configuring database connection
  |----------------------------------------------------------
  */
  DB_HOST: Env.schema.string(),
  DB_PORT: Env.schema.number(),
  DB_USER: Env.schema.string(),
  DB_PASSWORD: Env.schema.string.optional(),
  DB_DATABASE: Env.schema.string(),

  /*
  |----------------------------------------------------------
  | Variables for configuring ally package
  |----------------------------------------------------------
  */

  GOOGLE_CLIENT_ID: Env.schema.string(),
  GOOGLE_CLIENT_SECRET: Env.schema.string(),
  /*
  |----------------------------------------------------------
  | config server
  |----------------------------------------------------------
  */
  SERVER_DOMAINE: Env.schema.string(),
  NEW_INSTANCE_RUNING: Env.schema.number(),

  S_API_VOLUME_SOURCE_BASE_IN_S_SERVER: Env.schema.string(),
  S_API_VOLUME_TARGET_IN_S_API_CONTAINER: Env.schema.string(),


  FILE_STORAGE_PATH: Env.schema.string(),
  FILE_STORAGE_URL: Env.schema.string(),

  SERVER_USER: Env.schema.string(),
  TEST_API_INTERVAL: Env.schema.number(),
  TEST_API_MAX_TENTATIVE: Env.schema.number(),
  MAX_RELAUNCH_API_INSTANCE: Env.schema.number(),
  DELAY_BEFOR_SERVER_DELETE_API_AFTER_REQUEST: Env.schema.number(),
  INTERNAL_API_SECRET: Env.schema.string(),
  S_API_INTERNAL_BASE_URL_PREFIX: Env.schema.string(),
  DOCKER_SWARM_NETWORK_NAME: Env.schema.string(),
  /*
  |----------------------------------------------------------
  | Redis configuration
  |----------------------------------------------------------
  */
  REDIS_HOST: Env.schema.string(),
  REDIS_PORT: Env.schema.number(),
  REDIS_PASSWORD: Env.schema.string.optional(),

  /*
  |----------------------------------------------------------
  | Variables for configuring the mail package
  |----------------------------------------------------------
  */
  BREVO_API_KEY: Env.schema.string(),
  /*
  |----------------------------------------------------------
  | JWT Validation
  |----------------------------------------------------------
  */
  S_SECRET_KEYS_CONTAINER_PATH: Env.schema.string(),
  /*
  |----------------------------------------------------------
  | APP PORT
  |----------------------------------------------------------
  */
  S_WELCOME_INTERNAL_PORT: Env.schema.number(),
  S_DASHBOARD_INTERNAL_PORT: Env.schema.number(),
  S_DOCS_INTERNAL_PORT: Env.schema.number(),
  // S_API_INTERNAL_PORT: Env.schema.number(),
  S_ADMIN_INTERNAL_PORT: Env.schema.number(),
  
/*
  |----------------------------------------------------------
  | WEB-PUSH Notification
  |----------------------------------------------------------
  */
  VAPID_PUBLIC_KEY: Env.schema.string(),
  VAPID_PRIVATE_KEY: Env.schema.string(),
  VAPID_SUBJECT: Env.schema.string(),
})
//stack, traget, job
