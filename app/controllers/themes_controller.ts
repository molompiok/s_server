// app/controllers/http/themes_controller.ts

import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import ThemeService from '#services/ThemeService'
import Theme from '#models/theme' // Pour typer le retour
import { v4 } from 'uuid'
import { updateFiles } from '../Utils/FileManager/UpdateFiles.js'
import { createFiles } from '../Utils/FileManager/CreateFiles.js'
import { EXT_IMAGE, MEGA_OCTET } from '../Utils/constantes.js'

export default class ThemesController {

    // TODO: Ajouter Middleware d'authentification et de vérification Admin pour toutes ces routes

    // --- Schémas de Validation Vine ---

    /**
     * Validateur pour la création/mise à jour de thème
     */
    static themePutValidator = vine.compile(
        vine.object({
            // ID sera dans les params pour update, fourni ici pour create/update si clé sémantique
            id: vine.string().trim().minLength(3).maxLength(50).optional(), // Optionnel si create/update basé sur param route
            name: vine.string().trim().minLength(3).maxLength(100).optional(),
            preview_images: vine.any().optional(),
            description: vine.string().trim().maxLength(500).nullable().optional().optional(),
            docker_image_name: vine.string().trim().regex(/^[a-z0-9_/-]+$/).optional(), // Format nom image docker
            docker_image_tag: vine.string().trim().regex(/^[\w.-]+$/).maxLength(50).optional(), // Format tag docker
            internal_port: vine.number().positive().optional(),
            source_path: vine.string().trim().url().nullable().optional(), // Ou juste string libre?
            is_public: vine.boolean().optional(),
            is_premium: vine.boolean().optional(),
            price: vine.number().positive().optional(),
            is_active: vine.boolean().optional(),
            is_default: vine.boolean().optional(),
        })
    )

    static themePostValidator = vine.compile(
        vine.object({
            // ID sera dans les params pour update, fourni ici pour create/update si clé sémantique
            name: vine.string().trim().minLength(3).maxLength(100),
            description: vine.string().trim().maxLength(500).nullable().optional(),
            docker_image_name: vine.string().trim().regex(/^[a-z0-9_/-]+$/), // Format nom image docker
            preview_images: vine.any().optional(),
            docker_image_tag: vine.string().trim().regex(/^[\w.-]+$/).maxLength(50), // Format tag docker
            internal_port: vine.number().positive(),
            source_path: vine.string().trim().url().nullable().optional(), // Ou juste string libre?
            is_public: vine.boolean().optional(),
            is_active: vine.boolean().optional(),
            is_default: vine.boolean().optional(),
            is_premium: vine.boolean().optional(),
            price: vine.number().positive().optional(),
        })
    )
    /**
     * Validateur pour la mise à jour du tag/version
     */
    static updateTagValidator = vine.compile(
        vine.object({
            docker_image_tag: vine.string().trim().regex(/^[\w.-]+$/).maxLength(50),
        })
    )

    async getTheme(theme_id: string, response: HttpContext['response']) {

        if (!theme_id) {
            return response.badRequest({ message: 'Theme ID is required' })
        }

        const theme = await Theme.find(theme_id)
        if (!theme) {
            return response.notFound({ message: 'Theme not found' })
        }
        return theme;
    }
    // --- Méthodes du Contrôleur (Supposent Admin Authentifié) ---

    /**
     * Crée ou met à jour un thème et lance/met à jour son service.
     * POST /themes
     * PUT /themes/:id
     */
    async upsert_theme({ request, response, params, auth, bouncer }: HttpContext) {
        
        try {
            await auth.authenticate()
            
        } catch (error) {
            console.log('await auth.authenticate()');
            return
        }
        
        try {
            bouncer.authorize('updateTheme');
            
        } catch (error) {
            console.log('bouncer.authorize(updateTheme);');
            return
            
        }
        
        const themeIdFromParams = params.id;
        let payload: any;
        let isUpdate = !!themeIdFromParams; // Vrai si PUT/PATCH avec :id

        try {
            // Choisir le bon validateur
            if (isUpdate) {
                payload = await request.validateUsing(ThemesController.themePutValidator);
            } else {
                payload = await request.validateUsing(ThemesController.themePostValidator);
            }
        } catch (error) {
            return response.badRequest(error);
        }


        // 1. Validation

        // Détermine l'ID : depuis les params (PUT) ou le body (POST avec ID sémantique)
        const isNewTheme = themeIdFromParams ?? v4()
        let themeId = isNewTheme

        // Si ID dans body et dans params, ils doivent correspondre pour PUT
        if (themeIdFromParams && payload.id && themeIdFromParams !== payload.id) {
            return response.badRequest({ message: "L'ID du thème dans l'URL et le corps de la requête ne correspondent pas." })
        }
        // Assigne l'ID final au payload pour l'appel service
        payload.id = themeId;

        // 2. Appel Service (gère create ou update + lancement Swarm)
        const result = await ThemeService.createOrUpdateAndRunTheme(payload, async () => {
            const img = await createFiles({
                request,
                column_name: 'preview_images',
                table_id: themeId,
                table_name: Theme.table,
                options: {
                    compress: 'img',
                    min: 1,
                    max: 7,
                    maxSize: 12 * MEGA_OCTET,
                    extname: EXT_IMAGE,
                    throwError: true
                },
                // Rendre icon requis (min: 1)
            });
            console.log('``````````````',
                img);

            return img;
        }, async (theme) => {
            const img = await updateFiles({
                request,
                table_name: Theme.table,
                table_id: theme.id,
                column_name: 'preview_images',
                lastUrls: theme.preview_images || [],
                newPseudoUrls: payload.preview_images,
                options: {
                    throwError: true,
                    min: 1,
                    max: 7,
                    compress: 'img',
                    extname: EXT_IMAGE,
                    maxSize: 12 * MEGA_OCTET,
                },
            });
            console.log('``````````````', img);
            return img
        });

        // 3. Réponse
        if (result.theme) {
            return response.status(!isUpdate ? 201 : 200).send(result.theme);
        } else {
            console.error(`Erreur upsert_theme ${themeId}:`, result.logs.errors);
            // Code 409 si l'ID existait déjà lors d'un POST qui n'est pas censé MAJ?
            // La logique est dans le service pour le moment.
            return response.internalServerError({ message: "Échec création/MàJ thème." });
        }
    }

    /**
     * Récupère la liste des thèmes (potentiellement filtrée).
     * GET /themes
     * GET /themes?public=true&active=true
     */
    async get_themes({ request, response }: HttpContext) {

        const qs = request.qs();
        const page = parseInt(qs.page ?? '1');
        const limit = parseInt(qs.limit ?? '10');
        const filterIsPublic = qs.public ? (qs.public === 'true') : undefined;
        const filterIsActive = qs.active ? (qs.active === 'true') : undefined;
        const filterIsDefault = qs.default ? (qs.default === 'true') : undefined;

        try {
            const query = Theme.query().orderBy('name');

            if (filterIsPublic !== undefined) query.where('is_public', filterIsPublic);
            if (filterIsActive !== undefined) query.where('is_active', filterIsActive);
            if (filterIsDefault !== undefined) query.where('is_default', filterIsDefault);

            const themes = await query.paginate(page, limit);
            
            
            return response.ok({
                list: themes.all(),
                meta: themes.getMeta()
            }); // Serialize par défaut

        } catch (error) {
            console.error("Erreur get_themes:", error);
            return response.internalServerError({ message: "Erreur serveur lors de la récupération des thèmes." });
        }
    }


    /**
     * Récupère les détails d'un thème spécifique.
     * GET /themes/:id
     */
    async get_theme({ params, response }: HttpContext) {
        const themeId = params.id;
        try {
            const theme = await Theme.find(themeId);
            if (!theme) return response.notFound({ message: "Thème non trouvé." });

            return response.ok(theme); // Renvoie tout l'objet par défaut
        } catch (error) {
            console.error(`Erreur get_theme ${themeId}:`, error);
            return response.internalServerError({ message: "Erreur serveur." });
        }
    }


    /**
     * Supprime un thème.
     * DELETE /themes/:id
     * DELETE /themes/:id?force=true
     */
    async delete_theme({ params, request, response, bouncer, auth }: HttpContext) {
        await auth.authenticate()
        await bouncer.authorize('updateTheme');

        const themeId = params.id;
        const forceDelete = request.qs().force === 'true';

        const theme = await this.getTheme(themeId, response);
        if (!theme) return


        const result = await ThemeService.deleteThemeAndCleanup(theme, forceDelete);

        if (result.success) {
            return response.noContent();
        } else {
            console.error(`Erreur delete_theme ${themeId}:`, result.logs.errors);
            // Vérifier si l'erreur est parce que le thème est utilisé (si !force)
            const isUsedError = result.logs.errors.some((err: any) => err.message?.includes("est utilisé par le store"));
            if (isUsedError && !forceDelete) {
                return response.conflict({ message: "Thème utilisé, suppression annulée. Utilisez ?force=true pour forcer." });
            }
            if (result.theme?.is_default) {
                return response.badRequest({ message: "Impossible de supprimer le thème par défaut." })
            }
            return response.internalServerError({ message: "Échec de la suppression." });
        }
    }

    // --- Actions sur l'état/version ---

    /**
     * Met à jour le tag d'image d'un thème (rolling update).
     * PUT /themes/:id/version
     * Body: { "docker_image_tag": "v2.2.0" }
     */
    async update_theme_version({ params, request, response, bouncer, auth }: HttpContext) {

        await auth.authenticate()
        await bouncer.authorize('updateTheme');

        const themeId = params.id;

        const theme = await this.getTheme(themeId, response);
        if (!theme) return
        // Validation
        let payload: any;
        try { payload = await request.validateUsing(ThemesController.updateTagValidator); }
        catch (error) {
            return response.badRequest(error)
        }

        const result = await ThemeService.updateThemeVersion(theme, payload.docker_image_tag);

        if (result.success && result.theme) {
            return response.ok(result.theme);
        } else {
            console.error(`Erreur update_theme_version ${themeId}:${payload.docker_image_tag}`, result.logs.errors);
            return response.internalServerError({ message: "Échec mise à jour version." });
        }
    }

    /**
     * Active ou désactive un thème globalement.
     * PUT /themes/:id/status
     * Body: { "is_active": true | false }
     */
    async update_theme_status({ params, request, response, bouncer, auth }: HttpContext) {
        await auth.authenticate()
        await bouncer.authorize('updateTheme');

        const themeId = params.id;
        // Validation
        const statusValidator = vine.compile(vine.object({ is_active: vine.boolean() }));
        let payload: any;
        try { payload = await request.validateUsing(statusValidator); }
        catch (error) {
            return response.badRequest(error)
        }
        const theme = await this.getTheme(themeId, response);
        if (!theme) return

        const result = await ThemeService.setThemeActiveStatus(theme, payload.is_active);

        if (result.success && result.theme) {
            return response.ok(result.theme);
        } else {
            console.error(`Erreur update_theme_status ${themeId}:`, result.logs.errors);
            const isDefaultError = result.logs.errors.some((err: any) => err.message?.includes("Désactivation thème par défaut interdite"));
            if (isDefaultError) return response.badRequest({ message: "Désactivation du thème par défaut interdite." });
            return response.internalServerError({ message: "Échec MàJ statut thème." });
        }
    }


    async update_theme_default({ params, response, bouncer, auth }: HttpContext) {
        await auth.authenticate()
        const themeId = params.id;

        const theme = await this.getTheme(themeId, response);
        if (!theme) return
        try {

            await bouncer.authorize('updateTheme');

        } catch (error) {
            console.log(error.message);

        }
        const result = await ThemeService.setDefaultTheme(theme);

        if (result.success && result.theme) {
            return response.ok(result.theme);
        } else {
            console.error(`Erreur update_theme_default ${themeId}:`, result.clientMessage);
            return response.internalServerError({ message: "Échec MàJ Default thème." });
        }
    }

    /**
     * Démarre le service d'un thème.
     * POST /themes/:id/start
     */
    async start_theme({ params, response, bouncer, auth }: HttpContext) {
        await auth.authenticate()
        const themeId = params.id;

        const theme = await this.getTheme(themeId, response);
        if (!theme) return
        await bouncer.authorize('updateTheme');

        const result = await ThemeService.startThemeService(theme); // Démarre 1 réplique par défaut

        if (result.success) {
            return response.ok({ message: "Demande de démarrage envoyée." });
        } else {
            console.error(`Erreur start_theme ${themeId}:`, result.logs.errors);
            return response.internalServerError({ message: "Échec démarrage thème." });
        }
    }

    /**
     * Arrête le service d'un thème.
     * POST /themes/:id/stop
     */
    async stop_theme({ params, response, bouncer, auth }: HttpContext) {
        await auth.authenticate()
        const themeId = params.id;

        const theme = await this.getTheme(themeId, response);
        if (!theme) return
        await bouncer.authorize('updateTheme');

        const result = await ThemeService.stopThemeService(theme);
        if (result.success) {
            return response.ok({ message: "Demande d'arrêt envoyée." });
        } else {
            console.error(`Erreur stop_theme ${themeId}:`, result.logs.errors);
            return response.internalServerError({ message: "Échec arrêt thème." });
        }
    }

    /**
     * Redémarre le service d'un thème.
     * POST /themes/:id/restart
     */
    async restart_theme({ params, response, bouncer, auth }: HttpContext) {
        await auth.authenticate()
        const themeId = params.id;

        const theme = await this.getTheme(themeId, response);
        if (!theme) return
        await bouncer.authorize('updateTheme');

        const result = await ThemeService.restartThemeService(theme);
        if (result.success) {
            return response.ok({ message: "Demande de redémarrage envoyée." });
        } else {
            console.error(`Erreur restart_theme ${themeId}:`, result.logs.errors);
            return response.internalServerError({ message: "Échec redémarrage thème." });
        }
    }

    // TODO: Ajouter un endpoint pour définir LE thème par défaut? (Ex: POST /themes/set-default/:id)
    // TODO: Endpoint pour scaler un thème à N répliques? POST /themes/:id/scale { replicas: N }

} // Fin classe ThemesController