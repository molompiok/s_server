// app/controllers/http/stores_controller.ts
// NOTE: J'ai mis le fichier dans controllers/http/ par convention Adonis v6

import type { HttpContext } from '@adonisjs/core/http'
import vine, { SimpleMessagesProvider } from '@vinejs/vine' // Import Vine pour validation
import StoreService from '#services/StoreService' // Importe notre service
import Store from '#models/store'
// import User from '#models/user'; // Pour typer auth.user

export default class StoresController {

  // --- Schémas de Validation Vine ---

  /**
   * Validateur pour la création de store
   */
  static createStoreValidator = vine.compile(
    vine.object({
      name: vine.string().trim().minLength(3).maxLength(50).regex(/^[a-z0-9-]+$/), // Slug-like
      title: vine.string().trim().minLength(5).maxLength(100),
      description: vine.string().trim().maxLength(500).optional(),
      // userId: vine.string().uuid().optional(), // Seulement pour admin
      // logo, coverImage sont gérés séparément via upload? Ou URLs?
      // domaines initiaux? Pas nécessaire, l'utilisateur peut les ajouter ensuite.
    })
  )

  /**
   * Validateur pour la mise à jour des infos du store
   */
   static updateStoreInfoValidator = vine.compile(
       vine.object({
         // store_id sera dans les paramètres de route, pas dans le body
         name: vine.string().trim().minLength(3).maxLength(50).regex(/^[a-z0-9-]+$/).optional(),
         title: vine.string().trim().minLength(5).maxLength(100).optional(),
         description: vine.string().trim().maxLength(500).optional(),
         // logo/coverImage via un autre endpoint ou comme string JSON? A clarifier.
       })
   )

   /**
    * Validateur pour ajouter/supprimer un domaine
    */
    static domainValidator = vine.compile(
        vine.object({
          // store_id dans les params
          domaine: vine.string().trim().url() // Validation domaine intégrée
        })
    )

  /**
   * Validateur pour changer le thème
   */
   static changeThemeValidator = vine.compile(
       vine.object({
           // store_id dans les params
           theme_id: vine.string().trim().nullable() // Permet null ou string (ID du thème)
       })
   )

   /**
    * Validateur pour changer la version d'API
    */
   static changeApiValidator = vine.compile(
       vine.object({
            // store_id dans les params
           api_id: vine.string().trim() // ID de la nouvelle API
       })
   )

   async  canManageStore(store_id: string, user_id: string, response: HttpContext['response']) {
     console.log({store_id});
     
     if (!store_id) {
       return response.badRequest({ message: 'Store ID is required' })
     }
   
     const store = await Store.find(store_id)
     if (!store) {
       return response.notFound({ message: 'Store not found' })
     }
   
     if (store.user_id !== user_id) {
       //TODO ou ADMIN
       return response.forbidden({ message: 'Forbidden operation' })
     }
     return store;
   }
   
   async can_manage_store({ request, response, auth }: HttpContext) {
     const user = await auth.authenticate()
     const { store_id } = request.only(['name', 'description', 'store_id',]);
     const store = await this.canManageStore(store_id, user.id, response);
       if (!store) return store
   }
  // --- Méthodes du Contrôleur ---

  /**
   * Crée un nouveau store et lance son infrastructure.
   * POST /stores
   */
  async create_store({ request, response, auth }: HttpContext) {
    const user = await auth.authenticate() // Assure l'authentification

    // 1. Validation des données d'entrée
    let payload: any;
    try {
        payload = await request.validateUsing(StoresController.createStoreValidator);
    } catch (error) {
        // Utiliser SimpleMessagesProvider pour formater les erreurs Vine
        return response.badRequest(error.message)
    }

    // 2. Appel au service métier
    const result = await StoreService.createAndRunStore({
      ...payload,
      userId: user.id // Ajoute l'ID de l'utilisateur authentifié
      // TODO: Gérer logo/cover si ce sont des uploads,
      //       cela se fait souvent dans une méthode dédiée après la création initiale.
    });

    // 3. Réponse HTTP basée sur le résultat du service
    if (result.success && result.store) {
      // Répondre avec les données du store créé
      // On peut choisir de ne pas inclure tous les champs ici (ex: pas is_running)
       return response.created(result.store.serialize({
            fields: { omit: ['is_running', /* autres champs internes? */] }
        }));
    } else {
      // Loguer les erreurs détaillées du service côté serveur est important
      console.error("Erreur lors de la création du store:", result.logs.errors);
      // Répondre avec une erreur générique ou plus spécifique si possible
      return response.internalServerError({
        message: 'La création du store a échoué. Veuillez réessayer ou contacter le support.',
        // Optionnel: Inclure logs.messages en DEV?
        // errors: result.logs.getMessages() // Attention aux infos sensibles
      });
    }
  }

   /**
    * Récupère une liste paginée de stores.
    * GET /stores
    * GET /stores?user_id=xxx (Admin only)
    * GET /stores?name=yyy
    * GET /stores?order_by=name_asc
    */
   async get_stores({ request, response, auth }: HttpContext) {
        // const user = await auth.authenticate() 
        const qs = request.qs()
        const page = parseInt(qs.page ?? '1')
        const limit = parseInt(qs.limit ?? '10')
        const orderBy = qs.order_by // Ex: 'name_asc', 'createdAt_desc'
        const filterName = qs.name
        const filterUserId = qs.user_id // Pourrait être utilisé par un admin

        // TODO: Logique de permission (Admin voit tout, User voit les siens)
        let queryUserId: string | undefined = undefined;
        if(filterUserId /* && userIsAdmin(user) */) {
            queryUserId = filterUserId;
        } 


        try {
            // Utiliser directement le Query Builder du modèle
             const query = Store.query().preload('currentApi').preload('currentTheme'); // Précharge relations utiles

             if (queryUserId) {
                 query.where('user_id', queryUserId);
             }

            if (filterName) {
                 query.where((builder) => {
                     builder.where('name', 'ILIKE', `%${filterName}%`) // ILIKE pour case-insensitive
                            .orWhere('title', 'ILIKE', `%${filterName}%`);
                 });
            }

            // Gestion du tri (basique)
            if(orderBy) {
                const [column, direction = 'asc'] = orderBy.split('_');
                if(['name', 'title', 'createdAt'].includes(column) && ['asc', 'desc'].includes(direction)){
                    query.orderBy(column, direction as 'asc' | 'desc');
                }
            } else {
                query.orderBy('createdAt', 'desc'); // Tri par défaut
            }

            const stores = await query.paginate(page, limit);

            return response.ok(stores.serialize({
                fields: { omit: ['is_running']} // Exclure is_running de la liste?
            }));

        } catch (error) {
             console.error("Erreur get_stores:", error);
             return response.internalServerError({ message: "Erreur serveur lors de la récupération des stores."});
        }
   }


   /**
    * Récupère les détails d'un store spécifique.
    * GET /stores/:id
    */
    async get_store({ params, response, auth }: HttpContext) {
        const user = await auth.authenticate();
        const storeId = params.id;

        try {
            const store = await Store.query()
                .where('id', storeId)
                .preload('currentApi')
                .preload('currentTheme')
                .first();

            if (!store) {
                return response.notFound({ message: "Store non trouvé." });
            }

            // Vérification des permissions (utilisateur propriétaire ou admin)
            if (store.user_id !== user.id /* && !userIsAdmin(user) */) {
                return response.forbidden({ message: "Accès non autorisé à ce store." });
            }

             return response.ok(store.serialize({ fields: { omit: ['is_running'] } }));

        } catch (error) {
            console.error("Erreur get_store:", error);
            return response.internalServerError({ message: "Erreur serveur lors de la récupération du store."});
        }
    }


  /**
   * Met à jour les informations de base d'un store.
   * PUT /stores/:id
   * PATCH /stores/:id
   */
  async update_store({ params, request, response, auth }: HttpContext) {
    const user = await auth.authenticate();
    const storeId = params.id;

    // 1. Validation
     let payload: any;
     try {
        payload = await request.validateUsing(StoresController.updateStoreInfoValidator);
     } catch (error) {
        return response.badRequest(error.message)
     }

    // 2. Vérifier permissions (que l'user est propriétaire) AVANT d'appeler le service
    const store = await Store.find(storeId);
     if (!store) return response.notFound({ message: "Store non trouvé." });
     if (store.user_id !== user.id /* && !userIsAdmin(user) */) {
        return response.forbidden({ message: "Action non autorisée sur ce store." });
     }
     // TODO: Si l'admin peut modifier, ajouter la vérification ici.

    // 3. Appel Service
    const result = await StoreService.updateStoreInfo(storeId, payload);

    // 4. Réponse
    if (result) {
      return response.ok(result.store?.serialize({ fields: { omit: ['is_running'] } }));
    } else {
       console.error(`Erreur update_store pour ${storeId}:`, result); // 'result' serait null ici... Log depuis le service.
      return response.internalServerError({ message: "La mise à jour a échoué." });
       // Ou 409 si l'erreur était un nom dupliqué (gérer dans le service et retourner un code d'erreur?)
    }
  }

  /**
   * Supprime un store.
   * DELETE /stores/:id
   */
  async delete_store({ params, response, auth }: HttpContext) {
    const user = await auth.authenticate();
    const storeId = params.id;

    // 1. Vérifier permissions
    const store = await Store.find(storeId);
    if (!store) return response.notFound({ message: "Store non trouvé." });
    if (store.user_id !== user.id /* && !userIsAdmin(user) */) {
      return response.forbidden({ message: "Action non autorisée." });
    }

    // 2. Appel Service
    const result = await StoreService.deleteStoreAndCleanup(storeId);

    // 3. Réponse
    if (result.success) {
      // Réponse standard pour DELETE réussi
      return response.noContent();
    } else {
       console.error(`Erreur delete_store ${storeId}:`, result.logs.errors);
       return response.internalServerError({ message: "La suppression a échoué."});
    }
  }

  // --- Actions spécifiques sur l'état/infrastructure ---

  /**
   * Arrête le service d'un store (scale 0).
   * POST /stores/:id/stop
   */
  async stop_store({ params, response, auth }: HttpContext) {
      const user = await auth.authenticate();
      const storeId = params.id;
      // Vérifier permissions (propriétaire ou admin)
       const store = await Store.find(storeId);
       if (!store) return response.notFound({ message: "Store non trouvé." });
       if (store.user_id !== user.id /* && !userIsAdmin(user) */) {
           return response.forbidden({ message: "Action non autorisée." });
       }

      const result = await StoreService.stopStoreService(storeId);
      if(result.success) {
           return response.ok({ message: "Demande d'arrêt envoyée."});
      } else {
          console.error(`Erreur stop_store ${storeId}:`, result.logs.errors);
          return response.internalServerError({ message: "Échec de l'arrêt."});
      }
  }

  /**
   * Démarre le service d'un store (scale 1).
   * POST /stores/:id/start
   */
   async start_store({ params, response, auth }: HttpContext) {
      const user = await auth.authenticate();
      const storeId = params.id;
      // Vérifier permissions
      const store = await Store.find(storeId);
       if (!store) return response.notFound({ message: "Store non trouvé." });
       if (store.user_id !== user.id /* && !userIsAdmin(user) */) {
           return response.forbidden({ message: "Action non autorisée." });
       }

      const result = await StoreService.startStoreService(storeId);
      if(result.success) {
           return response.ok({ message: "Demande de démarrage envoyée."});
      } else {
          console.error(`Erreur start_store ${storeId}:`, result.logs.errors);
           return response.internalServerError({ message: "Échec du démarrage."});
      }
   }

  /**
   * Redémarre le service d'un store.
   * POST /stores/:id/restart
   */
    async restart_store({ params, response, auth }: HttpContext) {
        const user = await auth.authenticate();
        const storeId = params.id;
         // Vérifier permissions
         const store = await Store.find(storeId);
         if (!store) return response.notFound({ message: "Store non trouvé." });
         if (store.user_id !== user.id /* && !userIsAdmin(user) */) {
            return response.forbidden({ message: "Action non autorisée." });
         }

        const result = await StoreService.restartStoreService(storeId);
        if(result.success) {
             return response.ok({ message: "Demande de redémarrage envoyée."});
        } else {
            console.error(`Erreur restart_store ${storeId}:`, result.logs.errors);
             return response.internalServerError({ message: "Échec du redémarrage."});
        }
    }

    /**
     * Met à l'échelle le service d'un store.
     * POST /stores/:id/scale
     * Body: { "replicas": 3 }
     */
    async scale_store({ params, request, response, auth }: HttpContext) {
        const user = await auth.authenticate(); // TODO: Admin only?
        const storeId = params.id;
         // Vérifier permissions (Admin?)
        const store = await Store.find(storeId);
        if (!store) return response.notFound({ message: "Store non trouvé." });
        // if (!userIsAdmin(user)) { return response.forbidden(); }

         // Validation
         const scaleValidator = vine.compile(vine.object({ replicas: vine.number().min(0) }));
         let payload: any;
         try { payload = await request.validateUsing(scaleValidator); }
         catch(error) {
            return response.badRequest(error.message)
         }

        const result = await StoreService.scaleStoreService(storeId, payload.replicas);
        if(result.success) {
             return response.ok({ message: `Demande de mise à l'échelle à ${payload.replicas} envoyée.`});
        } else {
             console.error(`Erreur scale_store ${storeId}:`, result.logs.errors);
             return response.internalServerError({ message: "Échec de la mise à l'échelle."});
        }
    }

  // --- Gestion Domaines / Thème / API ---

  /**
   * Ajoute un domaine custom à un store.
   * POST /stores/:id/domains
   * Body: { "domaine": "mon-site.com" }
   */
  async add_store_domain({ params, request, response, auth }: HttpContext) {
      const user = await auth.authenticate();
      const storeId = params.id;
      // Vérifier permissions
      const store = await Store.find(storeId);
       if (!store) return response.notFound({ message: "Store non trouvé." });
       if (store.user_id !== user.id /* && !userIsAdmin(user) */) {
           return response.forbidden({ message: "Action non autorisée." });
       }
       // TODO: Limite de domaines par plan?

       // Validation
       let payload: any;
       try { payload = await request.validateUsing(StoresController.domainValidator); }
       catch(error) {
          return response.badRequest(error.message)
       }

      const result = await StoreService.addStoreDomain(storeId, payload.domaine);
      if(result.success && result.store) {
           return response.ok(result.store.serialize({ fields: { omit: ['is_running'] } }));
      } else {
          console.error(`Erreur add_domain ${storeId}:`, result.logs.errors);
           return response.internalServerError({ message: "Échec ajout domaine."});
           // Ou 409 si domaine déjà pris globalement?
      }
  }

  /**
   * Supprime un domaine custom d'un store.
   * DELETE /stores/:id/domains
   * Body: { "domaine": "mon-site.com" } // Ou dans QueryString? Préférer body pour DELETE avec data
   */
  async remove_store_domain({ params, request, response, auth }: HttpContext) {
    const user = await auth.authenticate();
    const storeId = params.id;
    // Vérifier permissions
     const store = await Store.find(storeId);
     if (!store) return response.notFound({ message: "Store non trouvé." });
     if (store.user_id !== user.id /* && !userIsAdmin(user) */) {
         return response.forbidden({ message: "Action non autorisée." });
     }

     // Validation
     let payload: any;
     try { payload = await request.validateUsing(StoresController.domainValidator); } // Réutilise le même validateur
     catch(error) {
         return response.badRequest(error.message)
      }

    const result = await StoreService.removeStoreDomain(storeId, payload.domaine);
      if(result.success && result.store) {
           return response.ok(result.store.serialize({ fields: { omit: ['is_running'] } }));
      } else {
           console.error(`Erreur remove_domain ${storeId}:`, result.logs.errors);
           return response.internalServerError({ message: "Échec suppression domaine."});
      }
  }


   /**
    * Change le thème actif d'un store.
    * PUT /stores/:id/theme
    * Body: { "theme_id": "theme-unique-id" | null }
    */
   async change_store_theme({ params, request, response, auth }: HttpContext) {
        const user = await auth.authenticate();
        const storeId = params.id;
        // Vérifier permissions
        const store = await Store.find(storeId);
        if (!store) return response.notFound({ message: "Store non trouvé." });
        if (store.user_id !== user.id /* && !userIsAdmin(user) */) {
            return response.forbidden({ message: "Action non autorisée." });
        }
        // TODO: Vérifier si le user a accès à ce thème_id (si premium)

        // Validation
         let payload: any;
         try { payload = await request.validateUsing(StoresController.changeThemeValidator); }
         catch(error) {
             return response.badRequest(error.message)
          }

        const result = await StoreService.changeStoreTheme(storeId, payload.theme_id);
         if(result) { // Le service retourne le store mis à jour ou null
              return response.ok(result.store?.serialize({ fields: { omit: ['is_running'] } }));
         } else {
             // Les logs d'erreur sont dans le service
             return response.internalServerError({ message: "Échec changement thème."});
              // Peut être 404 si thème_id non trouvé, 403 si thème non autorisé, 500 sinon.
         }
   }

  /**
   * Change la version d'API utilisée par un store.
   * PUT /stores/:id/api
   * Body: { "api_id": "api-version-id" }
   */
    async change_store_api({ params, request, response, auth }: HttpContext) {
        const user = await auth.authenticate(); // Admin Only?
        const storeId = params.id;
         // Vérifier permissions (Admin?)
        const store = await Store.find(storeId);
        if (!store) return response.notFound({ message: "Store non trouvé." });
        // if (!userIsAdmin(user)) return response.forbidden();

         // Validation
          let payload: any;
          try { payload = await request.validateUsing(StoresController.changeApiValidator); }
          catch(error) {
              return response.badRequest(error.message)
           }

         const result = await StoreService.updateStoreApiVersion(storeId, payload.api_id);
         if(result) {
               return response.ok(result.store?.serialize({ fields: { omit: ['is_running'] } }));
         } else {
              return response.internalServerError({ message: "Échec MàJ version API."});
               // Peut être 404 si api_id non trouvé
         }
    }

     /**
      * Vérifie si un nom de store est disponible.
      * GET /stores/available-name?name=new-store-name
      */
     async available_name({ request, response }: HttpContext) {
         const name = request.qs().name;
         if (!name || typeof name !== 'string') {
              return response.badRequest({ message: "Paramètre 'name' manquant ou invalide." });
         }
         // Validation rapide format (identique à la création)
         if(!/^[a-z0-9-]+$/.test(name)) {
              return response.badRequest({ message: "Format de nom invalide."});
         }

         const exist = await Store.findBy('name', name);
         return response.ok({ is_available_name: !exist });
     }

     // --- Endpoints non migrés / A revoir ---
     /*
       async test_store... // Qu'est-ce que ça testait exactement? Peut-être GET /stores/:id/status?
       async can_manage_store... // Logique intégrée dans chaque méthode via auth/vérification user_id
     */

} // Fin de la classe StoresController