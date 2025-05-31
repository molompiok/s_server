// s_server/app/controllers/social_auth_controller.ts

import type { HttpContext } from '@adonisjs/core/http'
import env from '#start/env'
import logger from '@adonisjs/core/services/logger'

// Helper pour valider un UUID simple (inchangé)
function isValidUUID(uuid: string): boolean {
    return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(uuid);
}

export default class SocialAuthController {

    /**
     * Redirige l'utilisateur vers Google pour l'authentification.
     * Attend un paramètre query 'store_id'.
     */
    public async googleRedirect({ request, response, ally }: HttpContext) {
        const storeId = request.input('store_id')
        const clientSuccess = request.input('client_success')
        const clientError = request.input('client_error')

        if (!storeId || !isValidUUID(storeId)) {
            logger.warn({ query: request.qs() }, 'Missing or invalid store_id for Google redirect')
            return response.badRequest(`Identifiant de boutique (store_id) manquant ou invalide., \n Ex: ${env.get('SERVER_DOMAINE')}/auth/google/redirect?store_id=xxx&client_success=http://xxx/login-success&client_error=http://xxx/login-error`)
        }

        if(!clientSuccess) {
            logger.warn({ query: request.qs() }, `Missing or invalid client_success for Google redirect`)
            return response.badRequest(` (client_success) manquant ou invalide.  \n Ex: ${env.get('SERVER_DOMAINE')}/auth/google/redirect?store_id=xxx&client_success=http://xxx/login-success&client_error=http://xxx/login-error`)
        }

        if(!clientError) {
            logger.warn({ query: request.qs() }, `Missing or invalid client_error for Google redirect`)
            return response.badRequest(`(client_error) manquant ou invalide. \n Ex: ${env.get('SERVER_DOMAINE')}/auth/google/redirect?store_id=xxx&client_success=http://xxx/login-success&client_error=http://xxx/login-error`)
        }

        const state = JSON.stringify({ storeId, clientSuccess,clientError})

        try {
            const google = ally.use('google').stateless()

            return google.redirect((request) => {
                request.param('state', state)
            })
        } catch (error) {
            logger.error({ storeId, error: error.message }, 'Failed to generate Google redirect URL')
            return response.internalServerError('Impossible de démarrer l\'authentification Google.')
        }
    }

}

