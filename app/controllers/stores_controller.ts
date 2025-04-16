// app/controllers/http/stores_controller.ts
// NOTE: J'ai mis le fichier dans controllers/http/ par convention Adonis v6

import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine' // Import Vine pour validation
import StoreService from '#services/StoreService' // Importe notre service
import Store from '#models/store'
import { CHECK_ROLES } from '#abilities/main'
import { applyOrderBy } from '../Utils/query.js'
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
    })
  )

  /**
   * Validateur pour la mise à jour des infos du store
   */
  static updateStoreInfoValidator = vine.compile(
    vine.object({
      // store_id sera dans les paramètres de route, pas dans le body
      name: vine.string().trim().minLength(3).maxLength(50).regex(/^[a-z0-9-_]+$/).optional(),
      title: vine.string().trim().minLength(5).maxLength(100).optional(),
      description: vine.string().trim().maxLength(500).optional(),
      // logo/coverImage via un autre endpoint ou comme string JSON? A clarifier.
    })
  )

  /**
   * Validateur pour ajouter/supprimer un domain_name
   */
  static domainValidator = vine.compile(
    vine.object({
      // store_id dans les params
      domain_name: vine.string().trim().url() // Validation domain_name intégrée
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

  async getStore(store_id: string, response: HttpContext['response']) {
    
    if (!store_id) {
      return response.badRequest({ message: 'Store ID is required' })
    }

    const store = await Store.find(store_id)
    if (!store) {
      return response.notFound({ message: 'Store not found' })
    }
    return store;
  }

  /*************  CONTROLLER METHODS   ********************** */
  async create_store({ request, response, auth, bouncer }: HttpContext) { // Injecter bouncer
    const user = await auth.authenticate(); // Assure l'authentification

    // Vérification des permissions AVANT validation/traitement
    await bouncer.authorize('createStore'); // Vérifie si l'utilisateur connecté peut créer un store


    // --- 2. Validation du payload ---
    let payload: any
    try {
      payload = await request.validateUsing(StoresController.createStoreValidator)
    } catch (error) {
      return response.badRequest(error.message)
    }

    // --- 3. Logique de création via le service ---
    const result = await StoreService.createAndRunStore({
      ...payload,
      userId: user.id,
    })

    // --- 4. Réponse HTTP ---
    if (result.success && result.store) {
      return response.created(
        result.store.serialize({
          fields: { omit: ['is_running'] },
        })
      )
    } else {
      console.error("Erreur lors de la création du store:", result.logs.errors)
      return response.internalServerError({
        message: 'La création du store a échoué. Veuillez réessayer ou contacter le support.',
        errors: result.logs.errors.find((e) => e.includes('Nom de store')),
      })
    }
  }
  /**
   * Récupère une liste paginée de stores.
   * GET /stores
   * GET /stores?user_id=xxx (Admin only)
   * GET /stores?name=yyy
   * GET /stores?order_by=name_asc
   */
  async get_stores({ request, response, auth, bouncer }: HttpContext) {
    const user = await auth.authenticate()
    await bouncer.authorize('viewStoreList');

    
    let {page, limit, order_by,name,user_id} = request.qs()
    page = parseInt(page ?? '1')
    limit = parseInt(limit ?? '25')
    
    
    try {
      const query = Store.query().preload('currentApi').preload('currentTheme'); // Précharge relations utiles

      if (user_id ) {
        
        await user.load('roles');

        if(!CHECK_ROLES.isManager(user)){
          throw new Error(' "user_id" is an Admin option')
        } 
        
        if (user_id == 'all') {
          //nothing to do
        } else {
          query.where('user_id', user_id);
        } 
        
      } else {
        query.where('user_id', user.id);
      }

      if (name) {
        const searchTerm = `%${name.toLowerCase()}%`
        query.where((q) => {
          q.whereRaw('LOWER(stores.name) LIKE ?', [searchTerm])
            .orWhereRaw('LOWER(stores.description) LIKE ?', [searchTerm])
        })
      }


      if (order_by) {
        applyOrderBy(query, order_by, Store.table)
      }

      const stores = await query.paginate(page, limit);

      return response.ok(stores);

    } catch (error) {
      console.error("Erreur get_stores:", error);
      return response.internalServerError({ message: "Erreur serveur lors de la récupération des stores." });
    }
  }


  /**
   * Récupère les détails d'un store spécifique.
   * GET /stores/:id
   */
  async get_store({ params, response, auth, bouncer }: HttpContext) {
    const user = await auth.authenticate();
    const storeId = params.id;
    await bouncer.authorize('viewStoreList');

    try {
      const store = await Store.query()
        .where('id', storeId)
        .preload('currentApi')
        .preload('currentTheme')
        .first();

      if (!store) {
        return response.notFound({ message: "Store non trouvé." });
      }

      
      if (store.user_id !== user.id && !CHECK_ROLES.isManager(user)) {
          return response.forbidden({ message: "Accès non autorisé à ce store." });
      }

      return response.ok(store);

    } catch (error) {
      console.error("Erreur get_store:", error);
      return response.internalServerError({ message: "Erreur serveur lors de la récupération du store." });
    }
  }


  /**
   * Met à jour les informations de base d'un store.
   * PUT /stores/:id
   * PATCH /stores/:id
   */
  async update_store({ params, request, response ,bouncer}: HttpContext) {
    // const user = await auth.authenticate();
    const storeId = params.id;
    
    
    let payload: any;
    try {
      payload = await request.validateUsing(StoresController.updateStoreInfoValidator);
    } catch (error) {
      return response.badRequest(error.message)
    }
    
    const store = await this.getStore(storeId, response);
    if (!store) return
    await bouncer.authorize('updateStore',store);
    
    const result = await StoreService.updateStoreInfo(store, payload);

    if (result?.success) {
      return response.ok(result.store?.serialize({ fields: { omit: ['is_running'] } }));
    } else {
      console.error(`Erreur update_store pour ${storeId}:`, result); // 'result' serait null ici... Log depuis le service.
      return response.internalServerError({ message: "La mise à jour a échoué.", error: result.logs.errors.find(f => f.toLowerCase().includes('nom')) });
      // Ou 409 si l'erreur était un nom dupliqué (gérer dans le service et retourner un code d'erreur?)
    }
  }

  /**
   * Supprime un store.
   * DELETE /stores/:id
   */
  async delete_store({ params, response, bouncer }: HttpContext) {
    // const user = await auth.authenticate();
    
    
    const storeId = params.id;
    
    const store = await this.getStore(storeId, response);
    if (!store) return
    await bouncer.authorize('deleteStore',store);
    
    const result = await StoreService.deleteStoreAndCleanup(store);

    if (result.success) {
      return response.noContent();
    } else {
      console.error(`Erreur delete_store ${storeId}:`, result.logs.errors);
      return response.internalServerError({ message: "La suppression a échoué." });
    }
  }

  async update_store_status({ params, request, response, bouncer }: HttpContext) {
    // const user = await auth.authenticate();
    const storeId = params.id;
    // Validation
    const statusValidator = vine.compile(vine.object({ is_active: vine.boolean() }));
    let payload: any;
    try { payload = await request.validateUsing(statusValidator); }
    catch (error) {
      return response.badRequest(error)
    }

    const store = await this.getStore(storeId, response);
    if (!store) return
    await bouncer.authorize('manageStoreState',store);

    const result = await StoreService.setStoreActiveStatus(store, payload.is_active);

    if (result.success && result.store) {
      return response.ok(result.store);
    } else {
      console.error(`Erreur update_store_status ${storeId}:`, result.logs.errors);
      const isDefaultError = result.logs.errors.some((err: any) => err.message?.includes("Désactivation thème par défaut interdite"));
      if (isDefaultError) return response.badRequest({ message: "Désactivation du thème par défaut interdite." });
      return response.internalServerError({ message: "Échec MàJ statut thème." });
    }
  }
  // --- Actions spécifiques sur l'état/infrastructure ---

  /**
   * Arrête le service d'un store (scale 0).
   * POST /stores/:id/stop
   */
  async stop_store({ params, response, bouncer }: HttpContext) {
    // const user = await auth.authenticate();
    const storeId = params.id;

    const store = await this.getStore(storeId, response);
    if (!store) return
    await bouncer.authorize('manageStoreActivation',store);


    const result = await StoreService.stopStoreService(store);
    if (result.success) {
      return response.ok({ message: "Demande d'arrêt envoyée." });
    } else {
      console.error(`Erreur stop_store ${storeId}:`, result.logs.errors);
      return response.internalServerError({ message: "Échec de l'arrêt." });
    }
  }

  /**
   * Démarre le service d'un store (scale 1).
   * POST /stores/:id/start
   */
  async start_store({ params, response, bouncer }: HttpContext) {
    // const user = await auth.authenticate();
    const storeId = params.id;

    const store = await this.getStore(storeId, response);
    if (!store) return
    await bouncer.authorize('manageStoreActivation',store);


    const result = await StoreService.startStoreService(store);
    if (result.success) {
      return response.ok({ message: "Demande de démarrage envoyée." });
    } else {
      console.error(`Erreur start_store ${storeId}:`, result.logs.errors);
      return response.internalServerError({ message: "Échec du démarrage." });
    }
  }

  /**
   * Redémarre le service d'un store.
   * POST /stores/:id/restart
   */
  async restart_store({ params, response, bouncer }: HttpContext) {
    // const user = await auth.authenticate();
    const storeId = params.id;
    // Vérifier permissions
    const store = await this.getStore(storeId, response);
    if (!store) return
    await bouncer.authorize('manageStoreActivation',store);


    const result = await StoreService.restartStoreService(store);
    if (result.success) {
      return response.ok({ message: "Demande de redémarrage envoyée." });
    } else {
      console.error(`Erreur restart_store ${storeId}:`, result.logs.errors);
      return response.internalServerError({ message: "Échec du redémarrage." });
    }
  }

  /**
   * Met à l'échelle le service d'un store.
   * POST /stores/:id/scale
   * Body: { "replicas": 3 }
   */
  async scale_store({ params, request, response, bouncer }: HttpContext) {
    // const user = await auth.authenticate(); // TODO: Admin only?
    const storeId = params.id;
    // Vérifier permissions (Admin?)
    
    const store = await this.getStore(storeId, response);
    if (!store) return
    await bouncer.authorize('manageStoreActivation',store);


    // Validation
    const scaleValidator = vine.compile(vine.object({ replicas: vine.number().min(0) }));
    let payload: any;
    try { payload = await request.validateUsing(scaleValidator); }
    catch (error) {
      return response.badRequest(error.message)
    }

    const result = await StoreService.scaleStoreService(store, payload.replicas);
    if (result.success) {
      return response.ok({ message: `Demande de mise à l'échelle à ${payload.replicas} envoyée.` });
    } else {
      console.error(`Erreur scale_store ${storeId}:`, result.logs.errors);
      return response.internalServerError({ message: "Échec de la mise à l'échelle." });
    }
  }

  // --- Gestion domain_names / Thème / API ---

  /**
   * Ajoute un domain_name custom à un store.
   * POST /stores/:id/domains
   * Body: { "domain_name": "mon-site.com" }
   */
  async add_store_domain({ params, request, response, bouncer }: HttpContext) {
    // const user = await auth.authenticate();
    const storeId = params.id;
    
    const store = await this.getStore(storeId, response);
    if (!store) return
    await bouncer.authorize('manageStoreDomains',store);

    // TODO: Limite de domain_names par plan

    // Validation
    let payload: any;
    try { payload = await request.validateUsing(StoresController.domainValidator); }
    catch (error) {
      return response.badRequest(error)
    }

    const result = await StoreService.addStoreDomain(store, payload.domain_name);
    if (result.success && result.store) {
      return response.ok(result.store.serialize({ fields: { omit: ['is_running'] } }));
    } else {
      console.error(`Erreur add_domain ${storeId}:`, result.logs.errors);
      return response.internalServerError({ message: "Échec ajout domain_name." });
      // Ou 409 si domain_name déjà pris globalement?
    }
  }

  /**
   * Supprime un domain_name custom d'un store.
   * DELETE /stores/:id/domains
   * Body: { "domain_name": "mon-site.com" } // Ou dans QueryString? Préférer body pour DELETE avec data
   */
  async remove_store_domain({ params, request, response, bouncer }: HttpContext) {
    // const user = await auth.authenticate();
    const storeId = params.id;

    console.log(request.params(), request.body(), request.qs());

    const store = await this.getStore(storeId, response);
    if (!store) return
    await bouncer.authorize('manageStoreDomains',store);

    // Validation
    let payload: any;
    try { payload = await request.validateUsing(StoresController.domainValidator); } // Réutilise le même validateur
    catch (error) {
      return response.badRequest(error)
    }

    const result = await StoreService.removeStoreDomain(store, payload.domain_name);
    if (result.success && result.store) {
      return response.ok(result.store.serialize({ fields: { omit: ['is_running'] } }));
    } else {
      console.error(`Erreur remove_domain ${storeId}:`, result.logs.errors);
      return response.internalServerError({ message: "Échec suppression domain_name." });
    }
  }


  /**
   * Change le thème actif d'un store.
   * PUT /stores/:id/theme
   * Body: { "theme_id": "theme-unique-id" | null }
   */
  async change_store_theme({ params, request, response, bouncer }: HttpContext) {
    // const user = await auth.authenticate();
    const storeId = params.id;

    const store = await this.getStore(storeId, response);
    if (!store) return
    await bouncer.authorize('manageStoreTheme',store);

    // Validation
    let payload: any;
    try { payload = await request.validateUsing(StoresController.changeThemeValidator); }
    catch (error) {
      return response.badRequest(error.message)
    }

    const result = await StoreService.changeStoreTheme(store, payload.theme_id);
    if (result) { // Le service retourne le store mis à jour ou null
      return response.ok(result.store?.serialize({ fields: { omit: ['is_running'] } }));
    } else {
      // Les logs d'erreur sont dans le service
      return response.internalServerError({ message: "Échec changement thème." });
      // Peut être 404 si thème_id non trouvé, 403 si thème non autorisé, 500 sinon.
    }
  }

  /**
   * Change la version d'API utilisée par un store.
   * PUT /stores/:id/api
   * Body: { "api_id": "api-version-id" }
   */
  async change_store_api({ params, request, response, bouncer }: HttpContext) {
    // const user = await auth.authenticate();
    const storeId = params.id;

    
    const store = await this.getStore(storeId, response);
    if (!store) return
    await bouncer.authorize('manageStoreApi',store);

    // Validation
    let payload: any;
    try { payload = await request.validateUsing(StoresController.changeApiValidator); }
    catch (error) {
      return response.badRequest(error.message)
    }

    const result = await StoreService.updateStoreApiVersion(store, payload.api_id);
    if (result) {
      return response.ok(result.store?.serialize({ fields: { omit: ['is_running'] } }));
    } else {
      return response.internalServerError({ message: "Échec MàJ version API." });
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
    if (!/^[a-z0-9-]+$/.test(name)) {
      return response.badRequest({ message: "Format de nom invalide. [a-z0-9-]" });
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