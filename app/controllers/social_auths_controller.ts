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

    /**
     * Gère le retour de Google après authentification.
     */
    public async googleCallback({ request, response, ally }: HttpContext) { // Ajout de 'ally' ici
        // Utiliser ctx.ally directement
        const google = ally.use('google').stateless();

        if (google.accessDenied()) {
            console.log('You have cancelled the login process');
            return response.abort('You have cancelled the login process');
        }
        if (google.stateMisMatch()) {
            console.log('We are unable to verify the request. Please try again');
            
            return response.abort('We are unable to verify the request. Please try again')
        }
        if (google.hasError()) {
            return google.getError()
        }

        // 2. Vérifier le 'state' (inchangé)
        const state = request.input('state');
        let storeId: string | null = null;
        let clientSuccess: string|null = null;
        let clientError: string|null = null;
        try {
            if (!state) throw new Error('State parameter missing');
            const decodedState = JSON.parse(state);
            if (!decodedState.storeId || !isValidUUID(decodedState.storeId)) {
                throw new Error('Invalid storeId in state');
            }
            storeId = decodedState.storeId;
            clientError = decodedState.clientError;
            clientSuccess = decodedState.clientSuccess;
            logger.info({ state, storeId }, 'State parameter verified');
        } catch (error) {
            logger.error({ state, error: error.message }, 'Invalid or missing state parameter in callback');
            return response.redirect('/auth/error?message=' + encodeURIComponent('Paramètre de sécurité invalide'));
        }

        // 3. Échanger le code et obtenir les infos utilisateur Google (inchangé)
        try {
            const googleUser = await google.user();

            const profile = {
                provider: 'google',
                providerId: googleUser.id,
                email: googleUser.email,
                fullName: googleUser.name || googleUser.nickName || null,
                avatarUrl: googleUser.avatarUrl || null,
            };
            logger.info({ email: profile.email, storeId }, 'Google user profile retrieved');

            // 4. Préparer l'appel HTTP interne vers s_api (inchangé)
            const internalApiSecret = env.get('INTERNAL_API_SECRET');
            if (!internalApiSecret) {
                logger.fatal({ storeId }, 'INTERNAL_API_SECRET is not configured in s_server!');
                throw new Error('Internal server configuration error.');
            }
            const targetApiUrl = `http://0.0.0.0:3334/api/v1/auth/_internal/social-callback`;
            logger.info({ url: targetApiUrl }, 'Calling internal s_api endpoint...');

            // 5. Faire l'appel API interne synchrone avec fetch natif
            let apiResponseStatus: number;
            let apiResponseData: any;

            try {
                const fetchResponse = await fetch(targetApiUrl, {
                    method: 'POST',
                    headers: {
                        'X-Internal-Secret': internalApiSecret,
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                    },
                    body: JSON.stringify(profile),
                    // Ajouter un timeout via AbortController (méthode standard)
                    signal: AbortSignal.timeout(10000) // Timeout de 10 secondes
                });

                apiResponseStatus = fetchResponse.status;
                // Essayer de parser la réponse en JSON, même si le statut n'est pas 200
                // pour obtenir d'éventuels messages d'erreur de l'API
                try {
                    apiResponseData = await fetchResponse.json();
                } catch (jsonError) {
                    // Si la réponse n'est pas du JSON valide (ex: erreur 500 sans JSON)
                    apiResponseData = { message: `s_api returned non-JSON response with status ${apiResponseStatus}` };
                    logger.warn({ storeId, status: apiResponseStatus, url: targetApiUrl }, 's_api response was not valid JSON');
                }

            } catch (fetchError: any) {
                // Gérer les erreurs réseau, timeout, etc.
                logger.error({ storeId, url: targetApiUrl, error: fetchError.message, code: fetchError.name }, 'Fetch error calling s_api');
                // Relancer une erreur pour la capture globale plus bas
                throw new Error(`Failed to call s_api: ${fetchError.message}`);
            }

            // 6. Gérer la réponse de s_api
            if (apiResponseStatus === 200 && apiResponseData?.token) {
                logger.info({ storeId, email: profile.email, isNewUser: apiResponseData.is_new_user }, 's_api returned success token');

                
                // --- Succès ! Renvoyer le token à l'utilisateur (via fragment) ---
               
                const redirectUrlWithToken = `${clientSuccess}#token=${encodeURIComponent(apiResponseData.token)}&expires_at=${encodeURIComponent(apiResponseData.expires_at || '')}`;

                logger.info({ clientSuccess: clientSuccess }, 'Redirecting user to frontend with token fragment');
                return response.redirect(redirectUrlWithToken);

            } else {
                // Réponse inattendue ou erreur de s_api
                logger.error({ storeId, status: apiResponseStatus, data: apiResponseData, url: targetApiUrl }, 'Unexpected or error response from s_api internal callback');
                throw new Error(`s_api returned status ${apiResponseStatus}`);
            }

        } catch (error) {
            // Capture globale des erreurs (échange Google, validation state, appel fetch, réponse API invalide)
            logger.error({ storeId, error: error.message, stack: error.stack }, 'Error during Google callback processing or s_api call');
            return response.redirect(clientSuccess+'#message=' + encodeURIComponent('Erreur de connexion via Google'));
        }
    }
}