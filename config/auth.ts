// config/auth.ts
import { defineConfig } from '@adonisjs/auth'
import { tokensGuard, tokensUserProvider } from '@adonisjs/auth/access_tokens'
// import { sessionGuard, sessionUserProvider } from '@adonisjs/auth/session'
import type { InferAuthenticators, InferAuthEvents, Authenticators } from '@adonisjs/auth/types'
// Import ton guard personnalisé si Option B pour API Keys
// import { ApiKeyGuard, apiKeyUserProvider } from '#auth/api_key_guard'

const authConfig = defineConfig({
    default: 'api',

    guards: {
        // web:  sessionGuard({
        //   useRememberMeTokens: false,
        //   provider: sessionUserProvider({
        //     model: () => import('#models/user'),
        //   }),
        // }),

        // Guard Token (pour Mobile/SPA)
        api: tokensGuard({
             provider: tokensUserProvider({ // Le provider qui vérifie le token en BDD
                 model: () => import('#models/user'),
                 tokens: 'accessTokens', // Nom de la relation sur le modèle User si elle existe
             }),
        }),

        // Guard API Key (Optionnel, basé sur un guard personnalisé)
        /*
        apiKey: ApiKeyGuard({ // Utilise ton guard perso
             provider: apiKeyUserProvider({ // Un provider qui vérifie la clé API en BDD
                 // Logique pour trouver User via API Key
                 model: () => import('#models/user'),
             }),
        }),
        */
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