// s_server/app/controllers/http/ThemePreviewController.ts
import type { HttpContext } from '@adonisjs/core/http'
import PreviewSessionService from '#services/preview/PreviewSessionService'
import Store from '#models/store'
import Theme from '#models/theme'
import Api from '#models/api' // Pour l'API du store
import env from '#start/env'
import logger from '@adonisjs/core/services/logger'
import { CHECK_ROLES } from '#abilities/roleValidation'
import { devIp, http, isProd } from '../Utils/functions.js'
import { Readable } from 'stream'

export default class ThemePreviewController {

    /**
     * POST /api/v1/me/stores/:storeId/theme-preview-sessions
     * Body: { theme_id: "uuid_du_theme" }
     * Crée une session de prévisualisation et retourne une URL avec un token.
     */
    public async createPreviewSession({ request, response, auth, params }: HttpContext) {
        const storeId = params.storeId;
        const { theme_id: themeId } = request.body();

        const user = await auth.authenticate();

        if (!themeId) {
            return response.badRequest({ error: 'theme_id est requis.' });
        }

        // Vérifier que l'utilisateur est propriétaire du store (ou a les droits)
        const store = await Store.find(storeId);
        if (!store) {
            return response.notFound({ error: 'Store non trouvé.' });
        }
        // await bouncer.authorize('viewStore', store); // Ou une ability 'previewThemeOnStore'
        await user.load('roles')
        if (store.user_id !== user.id && !(CHECK_ROLES.isManager(user))) { // Simplifié pour l'exemple
            return response.forbidden({ error: 'Accès non autorisé à ce store.' });
        }


        // Vérifier que le thème existe et est actif
        const themeToPreview = await Theme.find(themeId);
        if (!themeToPreview || !themeToPreview.is_active) {
            logger.warn({ userId: user.id, storeId, themeId }, `Tentative de prévisualisation d'un thème invalide ou inactif.`);
            return response.badRequest({ error: 'Thème invalide ou non disponible pour la prévisualisation.' });
        }

        const token = await PreviewSessionService.createSession(user.id, storeId, themeId);

        if (token) {
            // L'URL de base du proxy de prévisualisation sur s_server
            const previewProxyBaseUrl = `${http}preview.${env.get('SERVER_DOMAINE')}`;
            const previewUrl = `${previewProxyBaseUrl}/${token}/`; // Ajoute le slash final !
            return response.ok({ preview_url: previewUrl });
        } else {
            return response.internalServerError({ error: 'Impossible de créer la session de prévisualisation.' });
        }
    }


    /**
     * /v1/theme-preview-proxy/:previewToken/*
     * Agit comme un reverse proxy vers le service thème approprié.
     */
    public async proxyThemeRequest({ request, response }: HttpContext) {


        let requestedPath = request.completeUrl().split('/internal-theme-preview-proxy')[1];
        requestedPath = requestedPath?.substring(requestedPath?.indexOf('/')) || '';

        let previewToken = '';
        let mode = 'params';
        if (requestedPath.startsWith('/preview_')) {
            previewToken = requestedPath.split('/')[1];
            const r = requestedPath.replace('/preview_', '');
            console.log('--> 1', r);

            requestedPath = r.substring(r.indexOf('/'))
            console.log('--> 2', requestedPath);

            response.cookie('preview-token', previewToken, {
                httpOnly: true,
                path: '/',
                sameSite: 'lax',
                maxAge: 60 * 60 * 24 * 30
            });
        } else {
            mode = 'cookie';
            previewToken = request.cookie('preview-token');
        }



        console.log({ previewToken, requestedPath, originalPath: request.url(),mode });

        if (!previewToken) throw new Error('💥❌💥 pas de previewToken')


        const logCtx = { previewToken, originalPath: request.url(), targetPath: requestedPath };
        logger.debug(logCtx, "Requête de proxy de prévisualisation reçue");


        const sessionData = await PreviewSessionService.validateSession(previewToken, requestedPath === '/'); // Consomme le token seulement pour la requête racine
        if (!sessionData) {
            logger.warn(logCtx, "Session de prévisualisation invalide ou expirée pour proxy");

            return response.forbidden({ error: 'Session de prévisualisation invalide ou expirée.' + requestedPath });
        }

        const { storeId, themeId } = sessionData;

        // Récupérer les infos du thème et de l'API du store
        const theme = await Theme.find(themeId);
        const store = await Store.find(storeId); // Pour obtenir l'ID de l'API du store

        if (!theme || !store || !store.current_api_id) { // Assumant que current_api_id est toujours défini pour un store valide
            logger.error({ ...logCtx, themeId, storeId }, "Thème ou store/API introuvable pour la prévisualisation");
            return response.internalServerError({ error: 'Configuration de prévisualisation manquante.' });
        }

        // Récupérer les détails de l'API du store pour son port
        const storeApi = await Api.find(store.current_api_id);
        if (!storeApi) {
            logger.error({ ...logCtx, storeApiId: store.current_api_id }, "Détails de l'API du store introuvables");
            return response.internalServerError({ error: 'Configuration API du store manquante.' });
        }


        const themeServiceName = isProd ? `theme_${theme.id}` : devIp;
        const themeInternalPort = theme.internal_port;
        // const apiStoreServiceName = `api_store_${store.id}`;
        // const apiStoreInternalPort = storeApi.internal_port;



        const targetUrl = `http://${themeServiceName}:${themeInternalPort}${requestedPath}`;


        logger.info({ ...logCtx, targetUrl }, "Proxying vers le service thème");

        const headersToTheme = new Headers(); // Utiliser node-fetch Headers
        headersToTheme.set('x-store-id', storeId);
        headersToTheme.set('x-server-url', `${http}${env.get('SERVER_DOMAINE', 'sublymus.com')}`);
        headersToTheme.set('x-server-api-url', `${http}server.${env.get('SERVER_DOMAINE', 'sublymus.com')}`);
        // headersToTheme.set('x-store-api-url', `http://${apiStoreServiceName}:${apiStoreInternalPort}`);
        headersToTheme.set('x-store-api-url', `${http}api.${env.get('SERVER_DOMAINE', 'sublymus.com')}/${store.id}`);
        headersToTheme.set('Content-Security-Policy', `frame-ancestors ${http}://dash.${env.get('SERVER_DOMAINE', 'sublymus.com')};`);
        headersToTheme.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        headersToTheme.set('Pragma', 'no-cache');
        headersToTheme.set('Expires', '0');

        // Transférer certains headers importants de la requête originale
        const originalHeadersToForward = ['user-agent', 'accept', 'accept-language', 'referer'];
        for (const headerName of originalHeadersToForward) {
            const headerValue = request.header(headerName);
            if (headerValue) {
                headersToTheme.set(headerName, headerValue);
            }
        }
        // Si la requête originale a un corps (POST, PUT), il faut le transférer
        // Note: request.raw() est un flux, il faut le consommer avec précaution ou utiliser request.body() si déjà parsé
        let bodyToTheme: string | null = null;
        if (request.method() !== 'GET' && request.method() !== 'HEAD') {
            // Si le corps est JSON et déjà parsé par Adonis, on le re-stringify
            // Sinon, il faudrait idéalement pouvoir piper le rawBodyStream.
            // Pour l'instant, on supporte le JSON.
            const contentType = request.header('content-type');
            if (contentType && contentType.includes('application/json')) {
                bodyToTheme = JSON.stringify(request.body());
                headersToTheme.set('Content-Type', 'application/json');
            } else if (request.raw()) {
                // Tenter de piper le flux brut si disponible et si node-fetch le supporte bien
                bodyToTheme = request.raw(); // Ceci peut nécessiter des ajustements
                // Pour la simplicité, on va se limiter au JSON ou aux requêtes sans corps
                logger.warn({ ...logCtx, contentType }, "Proxying non-GET/HEAD request with non-JSON body not fully supported for preview yet.");
            }
        }


        try {
            const themeResponse = await fetch(targetUrl, {
                method: request.method(),
                headers: headersToTheme,
                body: bodyToTheme,
                redirect: 'manual', // Important pour gérer les redirections
            });

            // Gérer les redirections du thème
            const previewProxyBaseUrl = `${http}preview.${env.get('SERVER_DOMAINE')}`;
            if (themeResponse.status >= 300 && themeResponse.status < 400 && themeResponse.headers.has('location')) {
                const location = themeResponse.headers.get('location')!;
                // Reconstruire l'URL de redirection pour qu'elle reste dans le contexte du proxy
                // Si location est absolue, on ne la change pas (le thème redirige vers un autre site)
                // Si location est relative (ex: /nouvelle-page), on la préfixe.
                let newLocation = location;
                if (location.startsWith('/')) {
                    newLocation = `${previewProxyBaseUrl}/${previewToken}${location}`;
                }
                logger.info({ ...logCtx, originalRedirect: location, newRedirect: newLocation }, "Redirection gérée par le proxy de prévisualisation");
                return response.redirect(newLocation, false, themeResponse.status); // false pour ne pas faire de lookup interne
            }

            // Transférer la réponse du thème
            response.status(themeResponse.status);
            themeResponse.headers.forEach((value, name) => {
                const lowerName = name.toLowerCase();
                if (!['transfer-encoding', 'connection', 'content-length', 'content-encoding',
                    'content-security-policy', 'cache-control', 'pragma', 'expires'].includes(lowerName)
                ) {
                    response.header(name, value);
                }
            });

            // Transférer le corps de la réponse en stream
            // @ts-ignore themeResponse.body est bien un ReadableStream pour node-fetch

            if (themeResponse.body) {
                const nodeStream = Readable.fromWeb(themeResponse.body);
                return response.stream(nodeStream);
            } else {
                return response.send(null);
            }
        } catch (error) {
            logger.error({ err: error, targetUrl, ...logCtx }, "Erreur critique lors du proxying vers le service thème");
            return response.internalServerError({ error: 'Erreur interne proxying prévisualisation.' });
        }
    }
}