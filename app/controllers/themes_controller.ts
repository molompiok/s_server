// app/controllers/http/themes_controller.ts

import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import ThemeService from '#services/ThemeService'
import Theme from '#models/theme' // Pour typer le retour

export default class ThemesController {

  // TODO: Ajouter Middleware d'authentification et de vérification Admin pour toutes ces routes

  // --- Schémas de Validation Vine ---

  /**
   * Validateur pour la création/mise à jour de thème
   */
  static themeValidator = vine.compile(
    vine.object({
      // ID sera dans les params pour update, fourni ici pour create/update si clé sémantique
       id: vine.string().trim().minLength(3).maxLength(50).optional(), // Optionnel si create/update basé sur param route
       name: vine.string().trim().minLength(3).maxLength(100),
       description: vine.string().trim().maxLength(500).nullable().optional(),
       image_name: vine.string().trim().regex(/^[a-z0-9_/-]+$/), // Format nom image docker
       docker_image_tag: vine.string().trim().regex(/^[\w.-]+$/).maxLength(50), // Format tag docker
       internal_port: vine.number().positive(),
       source_path: vine.string().trim().url().nullable().optional(), // Ou juste string libre?
       is_public: vine.boolean().optional(),
       is_active: vine.boolean().optional(),
       // is_default, is_running sont gérés par le service/logique interne
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

  // --- Méthodes du Contrôleur (Supposent Admin Authentifié) ---

  /**
   * Crée ou met à jour un thème et lance/met à jour son service.
   * POST /themes
   * PUT /themes/:id
   */
  async upsert_theme({ request, response, params }: HttpContext) {
    const themeIdFromParams = params.id;

    // 1. Validation
     let payload: any;
     try {
         payload = await request.validateUsing(ThemesController.themeValidator);
     } catch (error) {
         return response.badRequest(error.message);
     }

     // Détermine l'ID : depuis les params (PUT) ou le body (POST avec ID sémantique)
     const themeId = themeIdFromParams ?? payload.id;
     if (!themeId) {
          return response.badRequest({ message: "L'ID du thème est requis pour la création ou via l'URL pour la mise à jour."})
     }
      // Si ID dans body et dans params, ils doivent correspondre pour PUT
      if(themeIdFromParams && payload.id && themeIdFromParams !== payload.id) {
           return response.badRequest({ message: "L'ID du thème dans l'URL et le corps de la requête ne correspondent pas."})
      }


     // Assigne l'ID final au payload pour l'appel service
      payload.id = themeId;

    // 2. Appel Service (gère create ou update + lancement Swarm)
     const result = await ThemeService.createOrUpdateAndRunTheme(payload);

    // 3. Réponse
     if (result.success && result.theme) {
        return response.status(request.method() === 'POST' ? 201 : 200).send(result.theme);
     } else {
        console.error(`Erreur upsert_theme ${themeId}:`, result.logs.errors);
        // Code 409 si l'ID existait déjà lors d'un POST qui n'est pas censé MAJ?
        // La logique est dans le service pour le moment.
        return response.internalServerError({ message: "Échec création/MàJ thème."});
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

            if(filterIsPublic !== undefined) query.where('is_public', filterIsPublic);
            if(filterIsActive !== undefined) query.where('is_active', filterIsActive);
            if(filterIsDefault !== undefined) query.where('is_default', filterIsDefault);

            const themes = await query.paginate(page, limit);
           return response.ok(themes.serialize()); // Serialize par défaut

       } catch(error) {
            console.error("Erreur get_themes:", error);
            return response.internalServerError({ message: "Erreur serveur lors de la récupération des thèmes."});
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
            if(!theme) return response.notFound({ message: "Thème non trouvé."});
             return response.ok(theme); // Renvoie tout l'objet par défaut
        } catch(error) {
             console.error(`Erreur get_theme ${themeId}:`, error);
             return response.internalServerError({ message: "Erreur serveur."});
        }
   }


   /**
    * Supprime un thème.
    * DELETE /themes/:id
    * DELETE /themes/:id?force=true
    */
   async delete_theme({ params, request, response }: HttpContext) {
        const themeId = params.id;
        const forceDelete = request.qs().force === 'true';

        const result = await ThemeService.deleteThemeAndCleanup(themeId, forceDelete);

       if(result.success) {
           return response.noContent();
       } else {
            console.error(`Erreur delete_theme ${themeId}:`, result.logs.errors);
           // Vérifier si l'erreur est parce que le thème est utilisé (si !force)
            const isUsedError = result.logs.errors.some((err:any) => err.message?.includes("est utilisé par le store"));
            if(isUsedError && !forceDelete) {
                return response.conflict({ message: "Thème utilisé, suppression annulée. Utilisez ?force=true pour forcer."});
            }
            // Vérifier si erreur car thème par défaut
             const isDefaultError = result.logs.errors.some((err:any) => err.message?.includes("Impossible de supprimer le thème par défaut"));
            if (isDefaultError) {
                return response.badRequest({ message: "Impossible de supprimer le thème par défaut."})
            }
            return response.internalServerError({ message: "Échec de la suppression."});
       }
   }


   // --- Actions sur l'état/version ---

   /**
    * Met à jour le tag d'image d'un thème (rolling update).
    * PUT /themes/:id/version
    * Body: { "docker_image_tag": "v2.2.0" }
    */
   async update_theme_version({ params, request, response }: HttpContext) {
        const themeId = params.id;

        // Validation
        let payload: any;
         try { payload = await request.validateUsing(ThemesController.updateTagValidator); }
         catch(error) {
             return response.badRequest(error.message)
          }

        const result = await ThemeService.updateThemeVersion(themeId, payload.docker_image_tag);

       if(result.success && result.theme) {
            return response.ok(result.theme);
       } else {
            console.error(`Erreur update_theme_version ${themeId}:`, result.logs.errors);
            return response.internalServerError({ message: "Échec mise à jour version."});
       }
   }

    /**
     * Active ou désactive un thème globalement.
     * PUT /themes/:id/status
     * Body: { "is_active": true | false }
     */
    async update_theme_status({ params, request, response }: HttpContext) {
        const themeId = params.id;

        // Validation
         const statusValidator = vine.compile(vine.object({ is_active: vine.boolean() }));
         let payload: any;
         try { payload = await request.validateUsing(statusValidator); }
         catch(error) {
            return response.badRequest(error.message)
          }

        const result = await ThemeService.setThemeActiveStatus(themeId, payload.is_active);

         if(result.success && result.theme) {
              return response.ok(result.theme);
         } else {
              console.error(`Erreur update_theme_status ${themeId}:`, result.logs.errors);
               const isDefaultError = result.logs.errors.some((err:any) => err.message?.includes("Désactivation thème par défaut interdite"));
              if(isDefaultError) return response.badRequest({ message: "Désactivation du thème par défaut interdite."});
              return response.internalServerError({ message: "Échec MàJ statut thème."});
         }
    }


    /**
     * Démarre le service d'un thème.
     * POST /themes/:id/start
     */
    async start_theme({ params, response }: HttpContext) {
        const themeId = params.id;
        const result = await ThemeService.startThemeService(themeId); // Démarre 1 réplique par défaut
        if(result.success) {
             return response.ok({ message: "Demande de démarrage envoyée."});
        } else {
             console.error(`Erreur start_theme ${themeId}:`, result.logs.errors);
              return response.internalServerError({ message: "Échec démarrage thème."});
        }
    }

    /**
     * Arrête le service d'un thème.
     * POST /themes/:id/stop
     */
    async stop_theme({ params, response }: HttpContext) {
         const themeId = params.id;
         const result = await ThemeService.stopThemeService(themeId);
         if(result.success) {
              return response.ok({ message: "Demande d'arrêt envoyée."});
         } else {
              console.error(`Erreur stop_theme ${themeId}:`, result.logs.errors);
               return response.internalServerError({ message: "Échec arrêt thème."});
         }
    }

     /**
      * Redémarre le service d'un thème.
      * POST /themes/:id/restart
      */
     async restart_theme({ params, response }: HttpContext) {
          const themeId = params.id;
          const result = await ThemeService.restartThemeService(themeId);
          if(result.success) {
               return response.ok({ message: "Demande de redémarrage envoyée."});
          } else {
               console.error(`Erreur restart_theme ${themeId}:`, result.logs.errors);
               return response.internalServerError({ message: "Échec redémarrage thème."});
          }
     }

    // TODO: Ajouter un endpoint pour définir LE thème par défaut? (Ex: POST /themes/set-default/:id)
    // TODO: Endpoint pour scaler un thème à N répliques? POST /themes/:id/scale { replicas: N }

} // Fin classe ThemesController