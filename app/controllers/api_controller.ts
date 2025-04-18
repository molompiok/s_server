// app/controllers/http/api_controller.ts
import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import ApiService from '#services/ApiService' // Importe le nouveau service

/**
 
Logique restant a metre en place 

- STORE user (collaborator)  edite store via api => api request -> s_server for update

 

 */



export default class ApiController {

    // --- Schémas de Validation Vine ---

    static createApiValidator = vine.compile(
        vine.object({
            name: vine.string().trim().minLength(3).maxLength(50),
            description: vine.string().trim().maxLength(500).nullable().optional(),
            docker_image_name: vine.string().trim().regex(/^[a-z0-9_/-]+$/),
            docker_image_tag: vine.string().trim().regex(/^[\w.-]+$/).maxLength(50),
            internal_port: vine.number().positive(),
            source_path: vine.string().trim().nullable().optional(), //.regex( /^(?:(?:~|\/)([a-zA-Z0-9._-]+\/?)*|[a-zA-Z][a-zA-Z0-9+.-]*:\/\/.*)$/) Valide URL si présent
            is_default: vine.boolean().optional() // Pour création admin
        })
    )

    static updateApiValidator = vine.compile(
        vine.object({
            name: vine.string().trim().minLength(3).maxLength(50).optional(),
            description: vine.string().trim().maxLength(500).nullable().optional(),
            docker_image_name: vine.string().trim().regex(/^[a-z0-9_/-]+$/).optional(),
            docker_image_tag: vine.string().trim().regex(/^[\w.-]+$/).maxLength(50).optional(),
            internal_port: vine.number().positive().optional(),
            source_path: vine.string().trim().nullable().optional(),
            is_default: vine.boolean().optional() // Pour mise à jour admin
        })
    )

    /**
     * Crée une nouvelle définition d'API.
     * POST /apis
     */
    async create_api({ request, response, bouncer, auth }: HttpContext) {
        const user = await auth.authenticate() // TODO: Activer Auth (Admin Only)
        
        const ok = await bouncer.allows('manageApis');
        
        console.log({ok});
        
        // 1. Validation
        let payload: any;
        try {
            payload = await request.validateUsing(ApiController.createApiValidator);
        } catch (error) {

            return response.badRequest({
                error,
                payload
            })
        }

        // 2. Appel Service
        const result = await ApiService.createApi(payload);

        // 3. Réponse HTTP
        if (result.success && result.data) {
            return response.created(result.data);
        } else {
            console.error("Erreur create_api:", result.logs.errors, "Client Message:", result.clientMessage);
            // Si message client spécifique (ex: nom existe), retourner 409 ou 400
             if (result.clientMessage?.includes("existe déjà")) {
                 return response.conflict({ message: result.clientMessage });
             }
            return response.internalServerError({ message: result.clientMessage || 'Erreur serveur lors de la création.' });
        }
    }

    /**
     * Met à jour une définition d'API existante.
     * PUT /apis/:id
     */
    async update_api({ params, request, response, bouncer , auth}: HttpContext) {
        const user = await auth.authenticate() 
        
        await bouncer.authorize('manageApis');

        const apiId = params.id;

        // 1. Validation
        let payload: any;
        try {
            payload = await request.validateUsing(ApiController.updateApiValidator);
        } catch (error) {
            return response.badRequest(error.message)
        }

        // Si le payload est vide après validation (rien à MAJ), on peut retourner OK.
         if (Object.keys(payload).length === 0) {
             // Peut-être re-fetch l'API pour la retourner ? Ou juste 200 OK sans body.
             const currentApiResult = await ApiService.getApiById(apiId);
             if (currentApiResult.success && currentApiResult.data) return response.ok(currentApiResult.data);
             else return response.ok({ message: "Aucune modification détectée." });
         }

        // 2. Appel Service
        const result = await ApiService.updateApi(apiId, payload);

        // 3. Réponse HTTP
        if (result.success && result.data) {
            return response.ok(result.data);
        } else {
             console.error(`Erreur update_api ${apiId}:`, result.logs.errors, "Client Message:", result.clientMessage);
             if (result.clientMessage?.includes("existe déjà")) {
                return response.conflict({ message: result.clientMessage });
            }
             if (result.clientMessage?.includes("non trouvée")) {
                 return response.notFound({ message: result.clientMessage });
             }
            return response.internalServerError({ message: result.clientMessage || 'Erreur serveur lors de la mise à jour.' });
        }
    }

    /**
     * Récupère une liste paginée de définitions d'API.
     * GET /apis
     */
    async get_apis({ request, response, bouncer , auth}: HttpContext) {
        const user = await auth.authenticate() // Peut être utilisé par n'importe quel user authentifié ?

        await bouncer.authorize('manageApis');

        const qs = request.qs();
        const page = parseInt(qs.page ?? '1');
        const limit = parseInt(qs.limit ?? '10');
        const orderBy = qs.order_by;
        const filterName = qs.name;

        const options = {
            page: isNaN(page) ? 1 : page,
            limit: isNaN(limit) ? 10 : limit,
            orderBy,
            filterName,
        };

        const result = await ApiService.getApisList(options);

        if (result.success && result.data) {
            return response.ok(result.data.serialize()); // Lucid Paginator a une méthode serialize()
        } else {
            console.error("Erreur get_apis:", result.logs.errors);
            return response.internalServerError({ message: result.clientMessage || 'Erreur serveur lors de la récupération.' });
        }
    }

    /**
     * Récupère les détails d'une définition d'API spécifique.
     * GET /apis/:id
     */
    async get_api({ params, response, bouncer, auth}: HttpContext) {
        const user = await auth.authenticate() 
        await bouncer.authorize('manageApis');

        const apiId = params.id;
        const result = await ApiService.getApiById(apiId);

        if (result.success && result.data) {
            return response.ok(result.data);
        } else {
            console.error(`Erreur get_api ${apiId}:`, result.logs.errors);
            if (result.clientMessage?.includes("non trouvée")) {
                return response.notFound({ message: result.clientMessage });
            }
            return response.internalServerError({ message: result.clientMessage || 'Erreur serveur.' });
        }
    }

    /**
     * Supprime une définition d'API.
     * DELETE /apis/:id
     */
    async delete_api({ params, response, bouncer , auth}: HttpContext) {
        const user = await auth.authenticate() 
        
        await bouncer.authorize('manageApis');

        const apiId = params.id;
        const result = await ApiService.deleteApi(apiId);

        if (result.success) {
            return response.noContent();
        } else {
             console.error(`Erreur delete_api ${apiId}:`, result.logs.errors, "Client Message:", result.clientMessage);
             // Erreur spécifique si l'API est utilisée
            if (result.clientMessage?.includes("utilisée par")) {
                 return response.conflict({ message: result.clientMessage });
             }
             if (result.clientMessage?.includes("par défaut")) {
                 return response.badRequest({ message: result.clientMessage });
             }
            // L'API non trouvée est traitée comme un succès par le service
            return response.internalServerError({ message: result.clientMessage || 'Erreur serveur lors de la suppression.' });
        }
    }

} // Fin de la classe ApiController