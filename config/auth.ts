// config/auth.ts
import { defineConfig } from '@adonisjs/auth'
import { sessionUserProvider } from '@adonisjs/auth/session'
import type { InferAuthenticators, InferAuthEvents, Authenticators } from '@adonisjs/auth/types'
import { JwtGuard } from '../app/guards/jwt_s_server.js'
const authConfig = defineConfig({
default: 'jwt',
guards: {
jwt: (ctx) => {
return new JwtGuard(ctx, sessionUserProvider({
model: () => import('#models/user'),
}),{expiresIn:'7d'})
},
},
})
export default authConfig

/**
 * Inferring types from the configured auth
 * guards.
 */
declare module '@adonisjs/auth/types' {
  export interface Authenticators extends InferAuthenticators<typeof authConfig> {}
}
declare module '@adonisjs/core/types' {
  interface EventsList extends InferAuthEvents<Authenticators> {}
}