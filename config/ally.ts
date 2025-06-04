//config/ally.ts
import env from '#start/env'
import { defineConfig, services } from '@adonisjs/ally'
import { http } from '../app/Utils/functions.js'

const allyConfig = defineConfig({
  google: services.google({
    clientId: env.get('GOOGLE_CLIENT_ID'),
    clientSecret: env.get('GOOGLE_CLIENT_SECRET'),
    callbackUrl: `${http}server.${env.get('SERVER_DOMAINE')}${env.get('GOOGLE_CALLBACK')}`,
  }),
})

export default allyConfig

declare module '@adonisjs/ally/types' {
  interface SocialProviders extends InferSocialProviders<typeof allyConfig> {}
}
