// app/controllers/http/stores_controller.ts
// NOTE: J'ai mis le fichier dans controllers/http/ par convention Adonis v6

import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine' // Import Vine pour validation
import StoreService from '#services/StoreService' // Importe notre service
import Store from '#models/store'
// import { CHECK_ROLES } from '#abilities/roleValidation'
import { applyOrderBy } from '../Utils/query.js'
import { createFiles } from '../Utils/FileManager/CreateFiles.js'
import { v4 } from 'uuid'
import { EXT_IMAGE, MEGA_OCTET } from '../Utils/constantes.js'
import { updateFiles } from '../Utils/FileManager/UpdateFiles.js'
import { CHECK_ROLES } from '#abilities/roleValidation'
import logger from '@adonisjs/core/services/logger'
// import User from '#models/user'; // Pour typer auth.user

export default class StoresController {

  // --- Schémas de Validation Vine ---

  /**
   * Validateur pour la création de store
   */
  static createStoreValidator = vine.compile(
    vine.object({
      name: vine.string().trim().minLength(3).maxLength(50).regex(/^[a-z0-9-]+$/), // Slug-like
      title: vine.string().trim().minLength(1).maxLength(200),
      description: vine.string().minLength(1).trim().maxLength(1000),
      logo: vine.any().optional(),
      cover_image: vine.any().optional(),
      favicon: vine.any().optional(),
      timezone: vine.string().trim().optional(),
      currency: vine.string().trim().optional(),
    })
  )

  /**
   * Validateur pour la mise à jour des infos du store
   */
  static updateStoreInfoValidator = vine.compile(
    vine.object({
      name: vine.string().trim().minLength(3).maxLength(50).regex(/^[a-z0-9-_]+$/).optional(),
      title: vine.string().trim().minLength(5).maxLength(100).optional(),
      description: vine.string().trim().maxLength(500).optional(),
      logo: vine.any().optional(),
      cover_image: vine.any().optional(),
      favicon: vine.any().optional(),
      timezone: vine.string().trim().optional(),
      currency: vine.string().trim().optional(),
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

  getStoresValidator = vine.compile(
    vine.object({
      page: vine.number().optional(),
      limit: vine.number().optional(),
      order_by: vine.string().trim().optional(),
      name: vine.string().trim().optional(),
      user_id: vine.string().optional(),
      store_id: vine.string().optional(),
      slug: vine.string().trim().optional(),
      search: vine.string().trim().optional(),
      current_theme_id: vine.string().optional(),
      current_api_id: vine.string().optional(),
      is_active: vine.boolean().optional(),
      is_running: vine.boolean().optional(),
    })
  )
  private async getStore(store_id: string, response: HttpContext['response']) {

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
  async create_store({ request, response, auth, }: HttpContext) { // Injecter bouncer
    const user = await auth.authenticate(); // Assure l'authentification

    // Vérification des permissions AVANT validation/traitement
    // await bouncer.authorize('createStore'); // Vérifie si l'utilisateur connecté peut créer un store

    // MVP: Vérifier qu'un owner ne peut créer qu'un seul store
    const existingStoresCount = await Store.query().where('user_id', user.id).count('* as total')
    if (existingStoresCount[0].$extras.total >= 1) { // TODO : lever la limite (nomrbre de store) par une logique aproprier, chaque store comme des resources du VPS
      return response.forbidden({
        message: 'Vous avez atteint la limite de stores autorisés (1 store maximum pour le MVP)',
        code: 'MAX_STORES_REACHED'
      })
    }

    console.log({
      create: true,
      payload: request.body(),
    });
    // --- 2. Validation du payload ---
    let payload: any
    try {
      payload = await request.validateUsing(StoresController.createStoreValidator)
    } catch (error) {
      return response.badRequest(error.message)
    }

    console.log({
      create: true,
      payload,
    });

    const id = v4();
    const logo = await createFiles({
      request,
      column_name: "logo",
      table_id: id,
      table_name: Store.table,
      options: { compress: 'img', min: 1, max: 1, maxSize: 12 * MEGA_OCTET, extname: EXT_IMAGE, throwError: true }, // Rendre view requis (min: 1)
    });

    const cover_image = await createFiles({
      request, column_name: "cover_image", table_id: id, table_name: Store.table,
      options: { compress: 'img', min: 1, max: 1, maxSize: 12 * MEGA_OCTET, extname: EXT_IMAGE, throwError: true }, // Rendre icon requis (min: 1)
    });


    const favicon = await createFiles({
      request, column_name: "favicon", table_id: id, table_name: Store.table,
      options: { compress: 'img', min: 0, max: 1, maxSize: 12 * MEGA_OCTET, extname: EXT_IMAGE, throwError: true }, // Rendre icon requis (min: 1)
    });

    // --- 3. Logique de création via le service ---
    const result = await StoreService.createAndRunStore({
      ...payload,
      user_id: user.id,
      logo,
      cover_image,
      favicon: favicon.length > 0 ? favicon : logo
    })

    // --- 4. Créer le wallet STORE si création réussie ---
    if (result.success && result.store) {
      try {
        await result.store.ensureStoreWalletExists()
      } catch (walletError: any) {
        // On continue quand même, le wallet pourra être créé plus tard
        // Le store reste fonctionnel sans wallet
      }

      // --- 5. Attribuer le plan Free par défaut ---
      try {
        const { default: StoreSubscription } = await import('#models/store_subscription')
        const { default: SubscriptionPlan } = await import('#models/subscription_plan')
        const { DateTime } = await import('luxon')

        // Vérifier si le plan Free existe
        const freePlan = await SubscriptionPlan.find('free')
        if (freePlan) {
          // Créer la souscription Free
          await StoreSubscription.create({
            store_id: result.store.id,
            plan_id: 'free',
            status: 'active',
            starts_at: DateTime.now(),
            expires_at: DateTime.now().plus({ years: 100 }), // Plan Free permanent
            duration_months: 0, // Durée illimitée
            amount_paid: 0, // Gratuit
          })
          logger.info({ storeId: result.store.id }, 'Plan Free attribué automatiquement')
        }
      } catch (subscriptionError: any) {
        logger.warn({
          storeId: result.store.id,
          error: subscriptionError.message,
        }, 'Échec attribution plan Free, continuez quand même')
        // On continue, le plan pourra être attribué manuellement
      }

      return response.created(
        {
          message: 'Store cree avec succès',
          store: result.store.serialize()
        }
      )
    } else {
      console.error("Erreur lors de la création du store:", result.logs.errors)
      const errorMessages = result.logs.errors.map((e: any) => {
        if (typeof e === 'string') return e;
        if (e?.message) return e.message;
        if (e?.stderr) return e.stderr;
        return JSON.stringify(e);
      }).join('; ');
      return response.internalServerError({
        message: 'La création du store a échoué. Veuillez réessayer ou contacter le support.',
        errors: result.logs.errors,
        errorDetails: errorMessages
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
  async get_stores({ request, response, auth }: HttpContext) {
    // await bouncer.authorize('viewStoreList');

    console.log(request.qs());
    let payload;
    try {
      payload = await this.getStoresValidator.validate(request.all());
    } catch (error) {
      return response.badRequest(error.message)
    }

    let { page, user_id, limit, order_by, name, search, store_id, slug, current_theme_id, current_api_id, is_active, is_running } = payload

    page = parseInt(page?.toString() ?? '1')
    limit = parseInt(limit?.toString() ?? '25')

    try {
      const query = Store
        .query()
        .preload('currentApi')
        .preload('currentTheme');

      if (user_id) {
        const user = await auth.authenticate()
        await user.load('roles');
        if (!CHECK_ROLES.isManager(user)) {
          throw new Error(' "user_id" is an Admin option')
        }
        query.andWhere((q) =>
          q.where('stores.user_id', user_id)
            .orWhereExists((subQuery) => {
              subQuery
                .from('store_collaborators')
                .whereColumn('store_collaborators.store_id', 'stores.id')
                .where('store_collaborators.user_id', user_id)
            }))

      } else {
        if (!store_id) {
          const user = await auth.authenticate()
          query.andWhere((q) =>
            q.where('stores.user_id', user.id)
              .orWhereExists((subQuery) => {
                subQuery
                  .from('store_collaborators')
                  .whereColumn('store_collaborators.store_id', 'stores.id')
                  .where('store_collaborators.user_id', user.id)
              }))
        }
      }

      if (name) {
        const searchTerm = `%${name.toLowerCase()}%`
        query.where((q) => {
          q.whereRaw('LOWER(stores.name) LIKE ?', [searchTerm])
            .orWhereRaw('LOWER(stores.description) LIKE ?', [searchTerm])
        })
      }

      if (slug) {
        const searchTerm = `%${slug.toLowerCase()}%`
        query.where((q) => {
          q.whereRaw('LOWER(stores.slug) LIKE ?', [searchTerm])
            .orWhereRaw('LOWER(stores.description) LIKE ?', [searchTerm])
        })
      }

      if (store_id) {
        query.where('id', store_id).limit(1);
        limit = 1;
      }

      if (current_theme_id) {
        query.where('current_theme_id', current_theme_id)
      }

      if (current_api_id) {
        query.where('current_api_id', current_api_id)
      }

      if ((is_active ?? undefined) !== undefined) {
        console.log({ is_active });

        //@ts-ignore
        query.where('is_active', is_active)
      }

      if (is_running) {
        query.where('is_running', is_running)
      }

      if (search) {
        if (search.startsWith('#')) {
          const searchTerm = search.substring(1).toLowerCase();
          const searchPattern = `${searchTerm}%`;
          query.whereRaw('LOWER(CAST(id AS TEXT)) LIKE ?', [searchPattern])
            .first()
        } else {
          const searchTerm = `%${search.toLowerCase().split(' ').join('%')}%`;
          query.where(q => {
            q.whereILike('name', searchTerm)
              .orWhereILike('title', searchTerm)
              .orWhereILike('description', searchTerm);
          });
        }
      }
      applyOrderBy(query, order_by || 'date_desc', Store.table)

      const stores = await query.paginate(page, limit);

      return response.ok({
        list: stores.all(),
        meta: stores.getMeta()
      });

    } catch (error) {
      if (error.message.includes('Unauthorized')) {
        return response.unauthorized('Unauthorized access')
      }
      console.error("Erreur get_stores:", error);
      return response.internalServerError({ message: "Erreur serveur lors de la récupération des stores." });
    }
  }


  /**
   * Récupère les détails d'un store spécifique.
   * GET /stores/:id
   */
  async get_store({ params, response }: HttpContext) {
    // await auth.authenticate();
    const storeId = params.id;
    // await bouncer.authorize('viewStoreList');

    try {
      const store = await Store.query()
        .where('id', storeId)
        .preload('currentApi')
        .preload('currentTheme')
        .preload('user')
        .first();

      if (!store) {
        return response.notFound({ message: "Store non trouvé." });
      }


      // if (store.user_id !== user.id && !CHECK_ROLES.isManager(user)) {
      //   return response.forbidden({ message: "Accès non autorisé à ce store." });
      // }

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
  async update_store({ params, request, response, bouncer, auth }: HttpContext) {
    await auth.authenticate();
    const storeId = params.id;


    let payload;
    try {
      payload = await request.validateUsing(StoresController.updateStoreInfoValidator);
    } catch (error) {
      return response.badRequest(error.message)
    }

    console.log(payload);


    const store = await this.getStore(storeId, response);
    if (!store) return

    await bouncer.authorize('updateStore', store);

    if (payload.logo) {

      const logo = await updateFiles({
        request, table_name: Store.table, table_id: store.id, column_name: 'logo',
        lastUrls: store['logo'] || [], newPseudoUrls: payload.logo,
        options: {
          throwError: true, min: 1, max: 1, compress: 'img',
          extname: EXT_IMAGE, maxSize: 12 * MEGA_OCTET,
        },
      });
      payload.logo = logo.length > 0 ? logo : undefined
    }

    if (payload.cover_image) {
      const cover_image = await updateFiles({
        request, table_name: Store.table, table_id: store.id, column_name: 'cover_image',
        lastUrls: store['cover_image'] || [], newPseudoUrls: payload.cover_image,
        options: {
          throwError: true, min: 1, max: 1, compress: 'img',
          extname: EXT_IMAGE, maxSize: 12 * MEGA_OCTET,
        },
      });
      payload.cover_image = cover_image.length > 0 ? cover_image : undefined
    }
    if (payload.favicon) {
      const favicon = await updateFiles({
        request, table_name: Store.table, table_id: store.id, column_name: 'favicon',
        lastUrls: store['favicon'] || [], newPseudoUrls: payload.favicon,
        options: {
          throwError: true, min: 0, max: 1, compress: 'img',
          extname: EXT_IMAGE, maxSize: 12 * MEGA_OCTET,
        },
      });
      payload.favicon = favicon.length > 0 ? favicon : store.logo
    }

    const result = await StoreService.updateStoreInfo(store, payload);
    console.log(result.store);

    if (result?.success) {
      return response.ok({
        message: 'Store updated with success',
        store: result.store
      });
    } else {
      console.error(`Erreur update_store pour ${storeId}:`, result); // 'result' serait null ici... Log depuis le service.
      return response.internalServerError({ message: "La mise à jour a échoué.", error: result.logs.errors.find((f: any) => f.toLowerCase().includes('nom')) });
      // Ou 409 si l'erreur était un nom dupliqué (gérer dans le service et retourner un code d'erreur?)
    }
  }

  /**
   * Supprime un store.
   * DELETE /stores/:id
   */
  async delete_store({ params, response, bouncer, auth }: HttpContext) {
    await auth.authenticate();


    const storeId = params.id;

    const store = await this.getStore(storeId, response);
    if (!store) return
    await bouncer.authorize('deleteStore', store);

    const result = await StoreService.deleteStoreAndCleanup(store);

    if (result.success) {
      return response.noContent();
    } else {
      console.error(`Erreur delete_store ${storeId}:`, result.logs.errors);
      return response.internalServerError({ message: "La suppression a échoué." });
    }
  }

  async update_store_status({ params, request, response, bouncer, auth }: HttpContext) {
    await auth.authenticate();
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
    await bouncer.authorize('manageStoreState', store);

    const result = await StoreService.setStoreActiveStatus(store, payload.is_active);

    if (result.success && result.store) {
      return response.ok({ store: result.store, message: "Demande d'arrêt envoyée." });
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
  async stop_store({ params, response, bouncer, auth }: HttpContext) {
    await auth.authenticate();
    const storeId = params.id;

    const store = await this.getStore(storeId, response);
    if (!store) return
    await bouncer.authorize('manageStoreActivation', store);


    const result = await StoreService.stopStoreService(store);
    if (result.success) {
      return response.ok({ store: result.store, message: "Demande d'arrêt envoyée." });
    } else {
      console.error(`Erreur stop_store ${storeId}:`, result.logs.errors);
      return response.internalServerError({ message: "Échec de l'arrêt." });
    }
  }

  /**
   * Démarre le service d'un store (scale 1).
   * POST /stores/:id/start
   */
  async start_store({ params, response, bouncer, auth }: HttpContext) {
    await auth.authenticate();
    const storeId = params.id;

    const store = await this.getStore(storeId, response);
    if (!store) return
    await bouncer.authorize('manageStoreActivation', store);


    const result = await StoreService.startStoreService(store);
    if (result.success) {
      return response.ok({ store: result.store, message: "Demande de démarrage envoyée." });
    } else {
      console.error(`Erreur start_store ${storeId}:`, result.logs.errors);
      return response.internalServerError({ message: "Échec du démarrage." });
    }
  }

  /**
   * Redémarre le service d'un store.
   * POST /stores/:id/restart
   */
  async restart_store({ params, response, bouncer, auth }: HttpContext) {
    await auth.authenticate();
    const storeId = params.id;
    // Vérifier permissions
    const store = await this.getStore(storeId, response);
    if (!store) return
    await bouncer.authorize('manageStoreActivation', store);


    const result = await StoreService.restartStoreService(store);
    if (result.success) {
      return response.ok({ store: result.store, message: "Demande de redémarrage envoyée." });
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
  async scale_store({ params, request, response, bouncer, auth }: HttpContext) {
    await auth.authenticate(); // TODO: Admin only?
    const storeId = params.id;
    // Vérifier permissions (Admin?)

    const store = await this.getStore(storeId, response);
    if (!store) return
    await bouncer.authorize('manageStoreActivation', store);


    // Validation
    const scaleValidator = vine.compile(vine.object({ replicas: vine.number().min(0) }));
    let payload: any;
    try { payload = await request.validateUsing(scaleValidator); }
    catch (error) {
      return response.badRequest(error.message)
    }

    const result = await StoreService.scaleStoreService(store, payload.replicas);
    if (result.success) {
      return response.ok({ store: result.store, message: `Demande de mise à l'échelle à ${payload.replicas} envoyée.` });
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
  async add_store_domain({ params, request, response, bouncer, auth }: HttpContext) {
    await auth.authenticate();
    const storeId = params.id;

    const store = await this.getStore(storeId, response);
    if (!store) return
    await bouncer.authorize('manageStoreDomains', store);

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
  async remove_store_domain({ params, request, response, bouncer, auth }: HttpContext) {
    await auth.authenticate();
    const storeId = params.id;

    console.log(request.params(), request.body(), request.qs());

    const store = await this.getStore(storeId, response);
    if (!store) return
    await bouncer.authorize('manageStoreDomains', store);

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
  async change_store_theme({ params, request, response, bouncer, auth }: HttpContext) {
    await auth.authenticate();
    const storeId = params.id;

    const store = await this.getStore(storeId, response);
    if (!store) return
    await bouncer.authorize('manageStoreTheme', store);

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
  async change_store_api({ params, request, response, bouncer, auth }: HttpContext) {
    await auth.authenticate();
    const storeId = params.id;


    const store = await this.getStore(storeId, response);
    if (!store) return
    await bouncer.authorize('manageStoreApi', store);

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
    console.log(name);

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