
// je veut un server robuste est facilement scalable. 

// l'architecture actuel comprend un server pricipal le s_server , une api dont l'image docker permet de disposer de plusieurs docker instance par boutique selon la charge de travaille.
//  des themes dont les images docker permetent de disposer de plusieurs docker instance qui servents toutes les boutique qui points vers eux..  theme_1 (Boutique 1, B2 , B3 ..) theme_2 (B40, B55..) ..

// la comunication entre les différents server est gerer par bullmq et et redis qui enregistre toutes modifications sur les stores et permet au theme de facilement faire la convertion ( url ex: sublymus.com/boutique.com -> api address ex: localhost:4563)
//   actuelement ce cette fonctionaliter qui doit etre ajouter.. la comunication etre s_server themes et s_api..

// voici le code. des service

// // app/services/SwarmService.ts
// import Dockerode, { type ServiceSpec, type Service, type Task, NetworkAttachmentConfig } from 'dockerode'
// import { Logs } from '../Utils/functions.js'
// import env from '#start/env';
// import { execa } from 'execa';


// ==>> on passe au controller

// // app/controllers/http/admin_controls_controller.ts

// import type { HttpContext } from '@adonisjs/core/http'
// import SwarmService from '#services/SwarmService'
// import StoreService from '#services/StoreService'
// import ThemeService from '#services/ThemeService'
// import fs from "node:fs/promises";
// import RoutingService, { NGINX_SITES_AVAILABLE, NGINX_SITES_ENABLED, SERVER_CONF_NAME } from '#services/RoutingService'
// import Store from '#models/store'
// import Theme from '#models/theme'
// import env from '#start/env'
// import path from 'node:path';
// import db from '@adonisjs/lucid/services/db';
// import vine from '@vinejs/vine';
// import { execa } from 'execa';
// import { v4, validate } from 'uuid';
// import User from '#models/user';
// import { CHECK_ROLES } from '#abilities/main';
// // import BullMQ from '#services/RedisService' // Si on veut exposer des contrôles BullMQ
// // import { Logs } from '#controllers/Utils/functions'; // Si on veut retourner des logs

// const MapDelete:Record<string,{path:string, expire_at:number}> = {};

// export default class AdminControlsController {

//     // TODO: Ajouter Middleware Admin strict sur toutes les routes de ce contrôleur

//     public async admin_logout_all_devices({ request, auth, response }: HttpContext) {

//         const { user_id } = request.qs()
//         const user = await auth.authenticate();
        
//         if (!CHECK_ROLES.isManager(user)) return response.unauthorized('user_id is Admin option');
        
//         const tagetUser = await User.find(user_id);
//         if (!tagetUser) return response.notFound('user not found');

//         const tokens = await User.accessTokens.all(tagetUser);
//         for (const token of tokens) {
//             await User.accessTokens.delete(tagetUser, token.identifier);
//         }

//         return response.ok({ message: 'Déconnexion de tous les appareils réussie.' });
//     }

//     /**
//      * Endpoint de diagnostic global (basique).
//      * GET /admin/status
//      */
//     async global_status({ response , bouncer}: HttpContext) {

//         await bouncer.authorize('performAdminActions');

//         let dockerOk = false;
//         let swarmInfo = null;
//         let storesSummary = { total: 0, active: 0, running: 0 };
//         let themesSummary = { total: 0, active: 0, running: 0 };

//         try {
//             // Vérifier connexion Docker/Swarm
//             swarmInfo = await SwarmService.docker.info(); // info() inclut Swarm si activé
//             dockerOk = !!swarmInfo;

//             // Résumé Stores
//             const storeCounts = await Store.query()
//                 .count('* as total')
//                 .count(db.raw(`CASE WHEN is_active = true THEN 1 ELSE NULL END`), 'active')
//                 .count(db.raw(`CASE WHEN is_running = true THEN 1 ELSE NULL END`), 'running')
//                 .first();
//             storesSummary = {
//                 total: parseInt(storeCounts?.$extras?.total ?? '0'),
//                 active: parseInt(storeCounts?.$extras?.active ?? '0'),
//                 running: parseInt(storeCounts?.$extras?.running ?? '0')
//             };


//             // Résumé Thèmes
//             const themeCounts = await Theme.query()
//                 .count('* as total')
//                 .count(db.raw(`CASE WHEN is_active = true THEN 1 ELSE NULL END`), 'active')
//                 .count(db.raw(`CASE WHEN is_running = true THEN 1 ELSE NULL END`), 'running')
//                 .first();
//             themesSummary = {
//                 total: parseInt(themeCounts?.$extras?.total ?? '0'),
//                 active: parseInt(themeCounts?.$extras?.active ?? '0'),
//                 running: parseInt(themeCounts?.$extras?.running ?? '0')
//             };


//             return response.ok({
//                 status: 'ok',
//                 docker_swarm_status: dockerOk ? 'connected' : 'error',
//                 swarm_node_count: dockerOk ? swarmInfo?.Swarm?.Nodes : null,
//                 stores: storesSummary,
//                 themes: themesSummary,
//                 // TODO: Ajouter état connexion DB, Redis...
//             });

//         } catch (error) {
//             console.error("Erreur Admin Status:", error);
//             return response.internalServerError({
//                 status: 'error',
//                 message: "Erreur lors de la récupération du statut global.",
//                 docker_swarm_status: dockerOk ? 'connected' : 'error', // Peut avoir réussi puis échoué après
//                 stores: storesSummary,
//                 themes: themesSummary,
//                 error: error.message,
//             });
//         }
//     }

//     /**
//      * Redémarre tous les services actifs (stores et thèmes).
//      * POST /admin/restart-all-services
//      */
//     async restart_all_services({ response, bouncer }: HttpContext) {
//         const results = { stores: { success: 0, failed: 0 }, themes: { success: 0, failed: 0 } };
//         let overallSuccess = true;
//         await bouncer.authorize('performAdminActions');
//         try {
//             console.warn("ADMIN ACTION: Redémarrage de tous les services store actifs...");
//             const activeStores = await Store.query().where('is_active', true);
//             for (const store of activeStores) {
//                 const result = await StoreService.restartStoreService(store.id);
//                 if (result.success) results.stores.success++;
//                 else { results.stores.failed++; overallSuccess = false; }
//             }
//             console.warn("ADMIN ACTION: Redémarrage de tous les services thème actifs...");
//             const activeThemes = await Theme.query().where('is_active', true);
//             for (const theme of activeThemes) {
//                 const result = await ThemeService.restartThemeService(theme.id);
//                 if (result.success) results.themes.success++;
//                 else { results.themes.failed++; overallSuccess = false; }
//             }

//             return response.ok({
//                 message: "Tentatives de redémarrage terminées.",
//                 details: results
//             });
//         } catch (error) {
//             console.error("Erreur restart_all_services:", error);
//             return response.internalServerError({
//                 message: "Erreur lors du redémarrage des services.",
//                 details: results, // Peut montrer succès partiels
//                 error: error.message
//             });
//         }
//     }

//     /**
//      * Force la mise à jour de TOUTES les configurations Nginx (serveur + stores).
//      * POST /admin/refresh-nginx
//      */
//     async refresh_nginx_configs({ response ,bouncer}: HttpContext) {

//         await bouncer.authorize('performAdminActions');

//         try {
//             console.warn("ADMIN ACTION: Rafraîchissement de toutes les configurations Nginx...");
//             let success = true;
//             const allStores = await Store.all();
//             // Mettre à jour chaque config store SANS reload individuel
//             for (const store of allStores) {
//                 success = await RoutingService.updateStoreRouting(store, false) && success;
//             }
//             // Mettre à jour config serveur ET faire le reload final
//             success = await RoutingService.updateServerRouting(true) && success;

//             if (success) {
//                 return response.ok({ message: "Configurations Nginx rafraîchies et rechargées." });
//             } else {
//                 return response.internalServerError({ message: "Échec lors du rafraîchissement Nginx (voir logs serveur)." });
//             }
//         } catch (error) {
//             console.error("Erreur refresh_nginx_configs:", error);
//             return response.internalServerError({ message: "Erreur serveur lors du rafraîchissement Nginx." });
//         }
//     }


//     /**
//      * Déclenche une vérification des répertoires orphelins (ancien GarbageCollector).
//      * POST /admin/garbage-collect/dirs
//      */
//     async garbage_collect_dirs({ response, bouncer }: HttpContext) {

//         await bouncer.authorize('performAdminActions');

//         try {
//             console.warn("ADMIN ACTION: Vérification des répertoires orphelins...");
//             // NOTE: L'ancienne logique inpectAppDirs utilisait execa('rm -rf') DIRECTEMENT.
//             // C'est dangereux. Une meilleure approche serait de LISTER les éléments suspects
//             // et de laisser l'admin confirmer la suppression via une autre action.

//             // Exemple modifié : LISTE seulement ce qui semble suspect
//             const stores = await Store.query().select('id');
//             //  const themes = await Theme.query().select('id'); // Pas utilisé avant mais logique de l'ajouter
//             const storeIds = stores.map(s => s.id);
//             //  const themeIds = themes.map(t => t.id); // TODO: Ajouter une gestion des volumes Thème si applicable

//             const suspects = {
//                 nginxAvailable: [] as string[],
//                 nginxEnabled: [] as string[],
//                 apiVolumes: [] as string[],
//             };

//             const checkDir = async (dirPath: string, validIds: string[], ignore: string[], targetArray: string[]) => {
//                 try {
//                     const files = await fs.readdir(dirPath);
//                     for (const fileName of files) {
//                         // Ignore les fichiers/dossiers spéciaux
//                         if (ignore.includes(fileName)) continue;
//                         // Vérifie si le nom (sans .conf) correspond à un ID valide
//                         const baseName = fileName.replace('.conf', '');
//                         if (!validIds.includes(baseName)) {
//                             targetArray.push(path.join(dirPath, fileName));
//                         }
//                     }
//                 } catch (error: any) { if (error.code !== 'ENOENT') console.error(`Erreur lecture ${dirPath}:`, error); }
//             };

//             const ignoreNginx = ['default', SERVER_CONF_NAME + '.conf'];
//             const apiVolumeBase = env.get('S_API_VOLUME_SOURCE', '/volumes/api');

//             await checkDir(NGINX_SITES_AVAILABLE, storeIds, ignoreNginx, suspects.nginxAvailable);
//             await checkDir(NGINX_SITES_ENABLED, storeIds, ignoreNginx, suspects.nginxEnabled);
//             await checkDir(apiVolumeBase, storeIds, [], suspects.apiVolumes);

//             return !response ? suspects : response.ok({
//                 message: "Vérification terminée. Liste des éléments potentiellement orphelins:",
//                 suspects
//                 // TODO: Ajouter un endpoint pour CONFIRMER la suppression de ces suspects.
//             });

//         } catch (error) {
//             console.error("Erreur garbage_collect_dirs:", error);
//             return !response? null : response.internalServerError({ message: "Erreur serveur lors de la vérification des répertoires." });
//         }
//     }
//     /**
//     * Validateur pour la suppression des répertoires/fichiers orphelins.
//     * Accepte une liste de chemins (chaînes).
//     */
//     static deleteGarbageValidator = vine.compile(
//         vine.object({
//             paths_to_delete: vine.array(vine.string().trim().minLength(1).optional()) // Doit être un tableau de chaînes non vides
//         })
//     )

//     /**
//      * Supprime une liste de fichiers/répertoires spécifiés avec confirmation sécurisée.
//      * DELETE /admin/garbage-collect/dirs
//      * Body: { "paths_to_delete": ["/path/to/delete1", "/path/to/delete2"], "confirmation_keys": ["key1", "key2"] }
//      */
//     async delete_garbage_dirs({ request, response , bouncer}: HttpContext) {
//         // 1. Validation du Payload

//         await bouncer.authorize('performDangerousAdminActions');

//         const validator = vine.compile(
//             vine.object({
//                 paths_to_delete: vine.array(vine.string().trim().minLength(1).optional()).optional(),
//                 confirmation_keys: vine.array(vine.string().trim().optional()).optional().optional(),
//             })
//         );

//         let payload: { paths_to_delete?: (string|undefined)[]; confirmation_keys?: (string|undefined)[] };
//         try {
//             payload = await request.validateUsing(validator);
//         } catch (error) {
//             return response.badRequest(error);
//         }

//         const pathsToDelete = payload.paths_to_delete?.filter((f): f is string => typeof f === 'string') || [];
//         const confirmationKeys = payload.confirmation_keys?.filter((f): f is string => typeof f === 'string') || [];

//         if (!pathsToDelete.length && !confirmationKeys.length) {
//             return response.badRequest({ message: "Au moins un chemin ou une clé de confirmation est requis." });
//         }

//         const allowedBasePaths = [
//             env.get('S_API_VOLUME_SOURCE', '/volumes/api/'),
//             NGINX_SITES_AVAILABLE,
//             NGINX_SITES_ENABLED,
//         ];

//         // Récupérer les chemins suspects depuis garbage_collect_dirs pour comparaison
//         let suspectPaths: string[] = [];
//         try {
//             const suspectResult =( await this.garbage_collect_dirs({response:null} as any));
//             if(suspectResult){
//                 suspectPaths = [
//                     ...suspectResult.nginxAvailable,
//                     ...suspectResult.nginxEnabled,
//                     ...suspectResult.apiVolumes,
//                 ];
//             }else{
//                 throw new Error ('garbage_collect_dirs() : null | void')
//             }
            
//         } catch (error) {
//             console.error("Erreur lors de la récupération des suspects:", error);
//         }

//         const validatedPaths: string[] = [];
//         const pathsNeedingConfirmation: { path: string; key: string ,expire_at: number}[] = [];
//         const errors: { path: string; error: string }[] = [];
//         const deletionResults: { path: string; success: boolean; error?: string }[] = [];

//         // 2. Validation et vérification des chemins
//         for (const rawPath of pathsToDelete) {
//             const cleanPath = path.normalize(rawPath);

//             // Vérifier si le chemin est dans une zone autorisée
//             if (!allowedBasePaths.some((base) => cleanPath.startsWith(base + path.sep))) {
//                 errors.push({
//                     path: rawPath,
//                     error: `Chemin non autorisé car en dehors des zones gérées (${allowedBasePaths.join(', ')})`,
//                 });
//                 continue;
//             }

//             // Éviter de supprimer la base des volumes
//             if (
//                 [env.get('S_API_VOLUME_SOURCE', '/volumes/api/'), NGINX_SITES_AVAILABLE, NGINX_SITES_ENABLED].some(
//                     (base) => cleanPath === base + path.sep
//                 )
//             ) {
//                 errors.push({ path: rawPath, error: `Suppression du répertoire de base '${cleanPath}' interdite.` });
//                 continue;
//             }

//             const fileName = path.basename(cleanPath);
//             const isUuid = validate(fileName.replace('.conf', '')); // Vérifie UUID ou UUID.conf
//             const isSuspect = suspectPaths.includes(cleanPath);

//             // Si c'est un UUID (volume) ou UUID.conf (nginx) ET dans les suspects, pas besoin de confirmation
//             if (isUuid && isSuspect) {
//                 validatedPaths.push(cleanPath);
//             } else {
//                 // Générer une clé de confirmation
//                 let  confirmationKey = v4().split('-')[0];
//                 // await Redis.setex(`delete_confirm:${confirmationKey}`, 600, cleanPath); // Expire dans 10min
//                 MapDelete[confirmationKey] = {
//                     expire_at:Date.now() + 60 * 1_000,
//                     path:cleanPath
//                 }
//                 pathsNeedingConfirmation.push({ path: cleanPath, key: confirmationKey,expire_at:MapDelete[confirmationKey].expire_at, });
//             }
//         }

//         // 3. Gestion des clés de confirmation fournies
//         const confirmedPaths: string[] = [];
//         const expiredKeys: string[] = [];

//         for (const key of confirmationKeys) {
//             // const storedPath = await Redis.get(`delete_confirm:${key}`);
//             const storedPath =  MapDelete[key];
//             console.log({storedPath});
            
//             if (storedPath  && storedPath.expire_at > Date.now()) {
//                 confirmedPaths.push(storedPath.path);
//                 // await Redis.del(`delete_confirm:${key}`); // Supprimer la clé après usage
//                 delete  MapDelete[key];
//             } else {
//                 expiredKeys.push(key);
//                 delete  MapDelete[key]; // TODO fuite memoire
//             }
//         }

//         // Ajouter les chemins confirmés aux chemins validés
//         validatedPaths.push(...confirmedPaths);

//         console.log({validatedPaths, confirmedPaths});
        
//         // 4. Exécution de la suppression
//         for (const pathToDelete of validatedPaths) {
//             try {
//                 console.warn(`ADMIN ACTION: Suppression demandée pour ${pathToDelete}...`);
//                 await execa('sudo', ['rm', '-rf', pathToDelete]);
//                 console.log(`  -> Suppression de ${pathToDelete} réussie.`);
//                 deletionResults.push({ path: pathToDelete, success: true });
//             } catch (error: any) {
//                 console.error(`  -> Erreur suppression de ${pathToDelete}:`, error);
//                 deletionResults.push({ path: pathToDelete, success: false, error: error.stderr || error.message });
//             }
//         }

//         // 5. Réponse
//         if (errors.length > 0) {
//             return response.badRequest({ message: "Certains chemins fournis sont invalides ou dangereux.", errors });
//         }

//         const responseData = {
//             message: pathsNeedingConfirmation.length
//                 ? "Certains chemins nécessitent une confirmation. Utilisez les clés fournies."
//                 : "Opération de suppression terminée.",
//             deleted: deletionResults.filter((r) => r.success).map((r) => r.path),
//             failed: deletionResults.filter((r) => !r.success),
//             confirmation_required: pathsNeedingConfirmation,
//             expired_keys: expiredKeys,
//         };

//         return response.ok(responseData);
//     }
// }

// // Fin classe AdminControlsController

// // app/controllers/http/api_controller.ts
// import type { HttpContext } from '@adonisjs/core/http'
// import vine from '@vinejs/vine'
// import ApiService from '#services/ApiService' // Importe le nouveau service

// /**
 
// Logique restant a metre en place 

// - STORE user (collaborator)  edite store via api => api request -> s_server for update

 

//  */



// export default class ApiController {

//     // --- Schémas de Validation Vine ---

//     static createApiValidator = vine.compile(
//         vine.object({
//             name: vine.string().trim().minLength(3).maxLength(50),
//             description: vine.string().trim().maxLength(500).nullable().optional(),
//             docker_image_name: vine.string().trim().regex(/^[a-z0-9_/-]+$/),
//             docker_image_tag: vine.string().trim().regex(/^[\w.-]+$/).maxLength(50),
//             internal_port: vine.number().positive(),
//             source_path: vine.string().trim().nullable().optional(), //.regex( /^(?:(?:~|\/)([a-zA-Z0-9._-]+\/?)*|[a-zA-Z][a-zA-Z0-9+.-]*:\/\/.*)$/) Valide URL si présent
//             is_default: vine.boolean().optional() // Pour création admin
//         })
//     )

//     static updateApiValidator = vine.compile(
//         vine.object({
//             name: vine.string().trim().minLength(3).maxLength(50).optional(),
//             description: vine.string().trim().maxLength(500).nullable().optional(),
//             docker_image_name: vine.string().trim().regex(/^[a-z0-9_/-]+$/).optional(),
//             docker_image_tag: vine.string().trim().regex(/^[\w.-]+$/).maxLength(50).optional(),
//             internal_port: vine.number().positive().optional(),
//             source_path: vine.string().trim().nullable().optional(),
//             is_default: vine.boolean().optional() // Pour mise à jour admin
//         })
//     )

//     /**
//      * Crée une nouvelle définition d'API.
//      * POST /apis
//      */
//     async create_api({ request, response, bouncer, auth }: HttpContext) {
//         const user = await auth.authenticate() // TODO: Activer Auth (Admin Only)
        
//         const ok = await bouncer.allows('manageApis');
        
//         console.log({ok});
        
//         // 1. Validation
//         let payload: any;
//         try {
//             payload = await request.validateUsing(ApiController.createApiValidator);
//         } catch (error) {

//             return response.badRequest({
//                 error,
//                 payload
//             })
//         }

//         // 2. Appel Service
//         const result = await ApiService.createApi(payload);

//         // 3. Réponse HTTP
//         if (result.success && result.data) {
//             return response.created(result.data);
//         } else {
//             console.error("Erreur create_api:", result.logs.errors, "Client Message:", result.clientMessage);
//             // Si message client spécifique (ex: nom existe), retourner 409 ou 400
//              if (result.clientMessage?.includes("existe déjà")) {
//                  return response.conflict({ message: result.clientMessage });
//              }
//             return response.internalServerError({ message: result.clientMessage || 'Erreur serveur lors de la création.' });
//         }
//     }

//     /**
//      * Met à jour une définition d'API existante.
//      * PUT /apis/:id
//      */
//     async update_api({ params, request, response, bouncer }: HttpContext) {
//         // const user = await auth.authenticate() // TODO: Activer Auth (Admin Only)
        
//         await bouncer.authorize('manageApis');

//         const apiId = params.id;

//         // 1. Validation
//         let payload: any;
//         try {
//             payload = await request.validateUsing(ApiController.updateApiValidator);
//         } catch (error) {
//             return response.badRequest(error.message)
//         }

//         // Si le payload est vide après validation (rien à MAJ), on peut retourner OK.
//          if (Object.keys(payload).length === 0) {
//              // Peut-être re-fetch l'API pour la retourner ? Ou juste 200 OK sans body.
//              const currentApiResult = await ApiService.getApiById(apiId);
//              if (currentApiResult.success && currentApiResult.data) return response.ok(currentApiResult.data);
//              else return response.ok({ message: "Aucune modification détectée." });
//          }

//         // 2. Appel Service
//         const result = await ApiService.updateApi(apiId, payload);

//         // 3. Réponse HTTP
//         if (result.success && result.data) {
//             return response.ok(result.data);
//         } else {
//              console.error(`Erreur update_api ${apiId}:`, result.logs.errors, "Client Message:", result.clientMessage);
//              if (result.clientMessage?.includes("existe déjà")) {
//                 return response.conflict({ message: result.clientMessage });
//             }
//              if (result.clientMessage?.includes("non trouvée")) {
//                  return response.notFound({ message: result.clientMessage });
//              }
//             return response.internalServerError({ message: result.clientMessage || 'Erreur serveur lors de la mise à jour.' });
//         }
//     }

//     /**
//      * Récupère une liste paginée de définitions d'API.
//      * GET /apis
//      */
//     async get_apis({ request, response, bouncer }: HttpContext) {
//         // const user = await auth.authenticate() // Peut être utilisé par n'importe quel user authentifié ?

//         await bouncer.authorize('manageApis');

//         const qs = request.qs();
//         const page = parseInt(qs.page ?? '1');
//         const limit = parseInt(qs.limit ?? '10');
//         const orderBy = qs.order_by;
//         const filterName = qs.name;

//         const options = {
//             page: isNaN(page) ? 1 : page,
//             limit: isNaN(limit) ? 10 : limit,
//             orderBy,
//             filterName,
//         };

//         const result = await ApiService.getApisList(options);

//         if (result.success && result.data) {
//             return response.ok(result.data.serialize()); // Lucid Paginator a une méthode serialize()
//         } else {
//             console.error("Erreur get_apis:", result.logs.errors);
//             return response.internalServerError({ message: result.clientMessage || 'Erreur serveur lors de la récupération.' });
//         }
//     }

//     /**
//      * Récupère les détails d'une définition d'API spécifique.
//      * GET /apis/:id
//      */
//     async get_api({ params, response, bouncer }: HttpContext) {
//         // const user = await auth.authenticate() // Tout user authentifié ?

//         await bouncer.authorize('manageApis');

//         const apiId = params.id;
//         const result = await ApiService.getApiById(apiId);

//         if (result.success && result.data) {
//             return response.ok(result.data);
//         } else {
//             console.error(`Erreur get_api ${apiId}:`, result.logs.errors);
//             if (result.clientMessage?.includes("non trouvée")) {
//                 return response.notFound({ message: result.clientMessage });
//             }
//             return response.internalServerError({ message: result.clientMessage || 'Erreur serveur.' });
//         }
//     }

//     /**
//      * Supprime une définition d'API.
//      * DELETE /apis/:id
//      */
//     async delete_api({ params, response, bouncer }: HttpContext) {
//         // const user = await auth.authenticate() // TODO: Activer Auth (Admin Only)
        
//         await bouncer.authorize('manageApis');

//         const apiId = params.id;
//         const result = await ApiService.deleteApi(apiId);

//         if (result.success) {
//             return response.noContent();
//         } else {
//              console.error(`Erreur delete_api ${apiId}:`, result.logs.errors, "Client Message:", result.clientMessage);
//              // Erreur spécifique si l'API est utilisée
//             if (result.clientMessage?.includes("utilisée par")) {
//                  return response.conflict({ message: result.clientMessage });
//              }
//              if (result.clientMessage?.includes("par défaut")) {
//                  return response.badRequest({ message: result.clientMessage });
//              }
//             // L'API non trouvée est traitée comme un succès par le service
//             return response.internalServerError({ message: result.clientMessage || 'Erreur serveur lors de la suppression.' });
//         }
//     }

// } // Fin de la classe ApiController


// // app/controllers/http/auth_controller.ts
// import type { HttpContext } from '@adonisjs/core/http'
// import vine from '@vinejs/vine'
// import User from '#models/user'
// import Role, { ROLES } from '#models/role' // Importe ROLES
// import hash from '@adonisjs/core/services/hash'
// import { DateTime } from 'luxon'
// import { v4 } from 'uuid'

// export default class AuthController {

//     // --- Validateurs ---
//     static registerValidator = vine.compile(
//         vine.object({
//             full_name: vine.string().trim().minLength(2), // renommé depuis name?
//             email: vine.string().trim().email(),
//             // Regex pour mot de passe (exemple : min 8 cars, 1 maj, 1 min, 1 chiffre)
//             password: vine.string().minLength(8).confirmed()
//                 .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/),

// /*
//                 TODO  : la page d'inscription doit montrer ces differentes condition a respecter.. 
                
//                 Doit contenir au moins une lettre minuscule
//                 (?=.*[A-Z])	Doit contenir au moins une lettre majuscule
//                 (?=.*\d)	Doit contenir au moins un chiffre
//                 .+$	Doit contenir au moins un caractère (en pratique, tout est déjà validé par minLength(8))
// */
//         })
//     )

//     static loginValidator = vine.compile(
//         vine.object({
//             email: vine.string().trim().email(),
//             password: vine.string(),
//         })
//     )

//     // --- Méthodes ---

//     /**
//      * Enregistre un nouvel utilisateur (OWNER par défaut)
//      * POST /auth/register
//      */
//     async register({ request, response }: HttpContext) {
//         const payload = await request.validateUsing(AuthController.registerValidator);

//         // Vérifier si l'email existe déjà
//         const existingUser = await User.findBy('email', payload.email);
//         if (existingUser) {
//             return response.conflict({ message: 'Cet email est déjà utilisé.' });
//         }

//         // Créer l'utilisateur
//         const user = new User();
//         user.fill({
//             id:v4(),
//             full_name: payload.full_name,
//             email: payload.email,
//             password: payload.password, // Sera hashé par le hook beforeSave
//             status: 'VISIBLE', // Ou 'NEW' si une validation email est requise?
//         });

//         // Récupérer le rôle OWNER (suppose qu'il existe et est seedé)
//         const ownerRole = await Role.findBy('name', ROLES.OWNER);
//         if (!ownerRole) {
//             console.error("ERREUR CRITIQUE: Rôle OWNER non trouvé dans la BDD. Lancez les seeders.");
//             return response.internalServerError({ message: "Erreur configuration serveur." });
//         }

//         await user.save(); // Sauvegarde l'utilisateur (le hook hash le mdp)

//         // Attache le rôle OWNER à l'utilisateur (relation ManyToMany)
//         await user.related('roles').attach([ownerRole.id]);

//         // Génère un token d'accès pour connecter l'utilisateur automatiquement
//         // Utilise une méthode sûre pour créer le token (qui le hashe)
//         const token = await User.accessTokens.create(user, ['*'], { // Donne toutes capacités '*' ici
//             // name: 'registration_token', // Nom optionnel pour le token
//             expiresIn: '7 days' // Donne un token un peu plus court pour l'enregistrement ?
//         });

//         // Charge les rôles pour les inclure dans la réponse
//         await user.load('roles');

//         return response.created({
//             user: user.serialize({ fields: { omit: ['password'] } }),
//             type: 'bearer',
//             token: token.value!.release(), // !! Important: .release() donne le token en clair UNE SEULE FOIS !!
//             // Optionnel : expiresIn calculé en timestamp
//             expires_at: token.expiresAt ? token.expiresAt.toISOString() : null,
//         });
//     }


//     /**
//      * Connecte un utilisateur avec email/password et retourne un Bearer Token
//      * POST /auth/login
//      */
//     async login({ request, response }: HttpContext) {
//         const { email, password } = await request.validateUsing(AuthController.loginValidator);

//         // 1. Trouver l'utilisateur
//         const user = await User.findBy('email', email);
//         if (!user) {
//             return response.unauthorized({ message: 'Email ou mot de passe invalide.' });
//         }

//         // 2. Vérifier le mot de passe
//         if (!(await hash.verify(user.password, password))) {
//             return response.unauthorized({ message: 'Email ou mot de passe invalide.' });
//         }

//         // 3. Vérifier si le compte est actif (optionnel mais recommandé)
//         // if (user.status !== 'VISIBLE') {
//         //     return response.forbidden({ message: 'Compte inactif ou suspendu.'});
//         // }

//         // 4. Générer un nouveau token d'accès
//         // On peut ajouter des capacités spécifiques ici si besoin
//         const token = await User.accessTokens.create(user, ['*'], { // Ou capacités plus fines
//             name: `login_token_${DateTime.now().toFormat('yyyyMMdd_HHmmss')}`, // Pour tracking
//             expiresIn: '30 days' // Ou depuis la config User.accessTokens
//         });

//         // 5. Charger les rôles pour les inclure
//         await user.load('roles');

//         // 6. Retourner la réponse avec le token
//         return response.ok({
//             user: user.serialize({ fields: { omit: ['password'] } }),
//             type: 'bearer',
//             token: token.value!.release(), // Ne pas oublier release()!
//             expires_at: token.expiresAt ? token.expiresAt.toISOString() : null,
//         });
//     }



//     /**
//      * Déconnecte l'utilisateur en supprimant le token utilisé pour la requête.
//      * POST /auth/logout (nécessite d'être authentifié avec le token)
//      */
//     async logout({ auth, response }: HttpContext) {
//         const user = await auth.authenticate();
//         await User.accessTokens.delete(user, user.currentAccessToken.identifier );
//         return response.ok({ message: 'Déconnexion réussie.' });
//     }


//     /**
//      * Retourne les informations de l'utilisateur connecté
//      * GET /auth/me (protégé par le middleware auth)
//      */
//     async me({ auth, response }: HttpContext) {
//         // auth.user est déjà chargé par le middleware (auth et initializeBouncer)
//         const user = await auth.authenticate(); // Renvoie erreur si non connecté

//         // Charge explicitement les rôles pour être sûr de les avoir
//         await user.load('roles');

//         // Récupère le token actuel (si besoin de l'info côté client ?)
//         const currentToken =  user.currentAccessToken

//         return response.ok({
//             user: user.serialize({ fields: { omit: ['password'] } }),
//             roles: user.roles.map(r => r.name), // Peut-être juste les noms?
//             current_token_info: {
//                expires_at: currentToken?.expiresAt?.toISOString() ?? null,
//             }
//         });
//     }


//     // --- Google OAuth (Adapté pour Tokens) ---

//     // GET /auth/google/redirect
//     async google_redirect({ ally }: HttpContext) {
//         // Redirige vers Google pour authentification
//         return ally.use('google').redirect((request) => {
//             // Optionnel: définir les scopes Google nécessaires
//             request.scopes(['openid', 'profile', 'email'])
//         });
//     }

//     // GET /auth/google/callback
//     async google_callback({ ally, response }: HttpContext) {
//         const google = ally.use('google');

//         // Gérer les erreurs potentielles de Google
//         if (google.accessDenied()) return response.badRequest("Accès refusé par Google.");
//         if (google.stateMisMatch()) return response.badRequest("Requête invalide ou expirée.");
//         if (google.hasError()) {
//             console.error("Erreur OAuth Google:", google.getError());
//             return response.badRequest(`Erreur Google: ${google.getError()}`);
//         }

//         // Récupérer les infos utilisateur de Google
//         const googleUser = await google.user();
//         if (!googleUser.email) {
//             return response.badRequest("L'email Google n'a pas pu être récupéré.");
//         }

//         // Chercher ou créer l'utilisateur local
//         let user = await User.query().where('email', googleUser.email).first();

//         // Lier le compte social à l'utilisateur
//         // Utilise findOrCreate pour éviter les erreurs si déjà lié
//         if (!user) {
//             // Si l'utilisateur n'existe PAS localement, on le crée
//             user = new User();
//             user.fill({
//                 full_name: googleUser.name,
//                 email: googleUser.email,
//                 // Pas de mot de passe local nécessaire si login via Google uniquement
//                 // On pourrait générer un mdp aléatoire ou laisser null selon la stratégie
//                 password: v4(), // Exemple MDP aléatoire
//                 status: 'VISIBLE',
//                 // Utilise l'avatar Google (assure-toi que `photos` est bien `string[]`)
//                 photos: googleUser.avatarUrl ? [googleUser.avatarUrl] : [],
//             });
//             await user.save();
//             // Assigner le rôle OWNER par défaut au nouvel utilisateur Google
//             const ownerRole = await Role.findByOrFail('name', ROLES.OWNER);
//             await user.related('roles').attach([ownerRole.id]);
//         } else {
//             // Si l'utilisateur existe déjà, on pourrait vouloir mettre à jour son avatar/nom?
//             user.full_name = googleUser.name;
//             if(googleUser.avatarUrl && (!user.photos || !user.photos.includes(googleUser.avatarUrl))) {
//                user.photos = [googleUser.avatarUrl, ...(user.photos ?? [])];
//             }

//             await user.save();
//         }


//         // Créer ou Mettre à jour la liaison compte social
//         // token, refreshToken, expiresAt sont pour l'API Google, pas notre Token d'accès
//         /*await user.related('socialAccounts').updateOrCreate(
//             { // Critères de recherche
//                 provider: 'google',
//                 providerId: googleUser.id,
//             },
//             { // Données à insérer/MAJ
//                 provider: 'google',
//                 providerId: googleUser.id,
//                 // Stocker le token Google? Optionnel, utile si on doit faire des appels API Google plus tard
//                 // providerToken: googleUser.token.token,
//                 // providerRefreshToken: googleUser.token.refreshToken,
//                 // providerExpiresAt: googleUser.token.expiresAt ? DateTime.fromMillis(googleUser.token.expiresAt) : null
//             }
//         );
// */
//         // Générer NOTRE token d'accès pour NOTRE API
//         const token = await User.accessTokens.create(user, ['*'], {
//             name: 'google_login_token',
//             expiresIn: '30 days'
//         });

//         await user.load('roles'); // Charger rôles pour réponse

//         // Réponse pour API/SPA : retourner un JSON avec le token
//         return response.ok({
//             message: "Connecté avec succès via Google",
//             user: user.serialize({ fields: { omit: ['password'] } }),
//             type: 'bearer',
//             token: token.value!.release(),
//             expires_at: token.expiresAt ? token.expiresAt.toISOString() : null,
//         });

//         // SI C'ETAIT UNE APP WEB AVEC SESSIONS :
//         // await auth.use('web').login(user);
//         // return response.redirect('/'); // Rediriger vers le dashboard

//         // PAS de redirection via HTML/JS ici pour une API
//     }

// } // Fin AuthController



// // app/controllers/http/stores_controller.ts
// // NOTE: J'ai mis le fichier dans controllers/http/ par convention Adonis v6

// import type { HttpContext } from '@adonisjs/core/http'
// import vine from '@vinejs/vine' // Import Vine pour validation
// import StoreService from '#services/StoreService' // Importe notre service
// import Store from '#models/store'
// import { CHECK_ROLES } from '#abilities/main'
// import { applyOrderBy } from '../Utils/query.js'
// // import User from '#models/user'; // Pour typer auth.user

// export default class StoresController {

//   // --- Schémas de Validation Vine ---

//   /**
//    * Validateur pour la création de store
//    */
//   static createStoreValidator = vine.compile(
//     vine.object({
//       name: vine.string().trim().minLength(3).maxLength(50).regex(/^[a-z0-9-]+$/), // Slug-like
//       title: vine.string().trim().minLength(5).maxLength(100),
//       description: vine.string().trim().maxLength(500).optional(),
//       // userId: vine.string().uuid().optional(), // Seulement pour admin
//       // logo, coverImage sont gérés séparément via upload? Ou URLs?
//     })
//   )

//   /**
//    * Validateur pour la mise à jour des infos du store
//    */
//   static updateStoreInfoValidator = vine.compile(
//     vine.object({
//       // store_id sera dans les paramètres de route, pas dans le body
//       name: vine.string().trim().minLength(3).maxLength(50).regex(/^[a-z0-9-_]+$/).optional(),
//       title: vine.string().trim().minLength(5).maxLength(100).optional(),
//       description: vine.string().trim().maxLength(500).optional(),
//       // logo/coverImage via un autre endpoint ou comme string JSON? A clarifier.
//     })
//   )

//   /**
//    * Validateur pour ajouter/supprimer un domain_name
//    */
//   static domainValidator = vine.compile(
//     vine.object({
//       // store_id dans les params
//       domain_name: vine.string().trim().url() // Validation domain_name intégrée
//     })
//   )

//   /**
//    * Validateur pour changer le thème
//    */
//   static changeThemeValidator = vine.compile(
//     vine.object({
//       // store_id dans les params
//       theme_id: vine.string().trim().nullable() // Permet null ou string (ID du thème)
//     })
//   )

//   /**
//    * Validateur pour changer la version d'API
//    */
//   static changeApiValidator = vine.compile(
//     vine.object({
//       // store_id dans les params
//       api_id: vine.string().trim() // ID de la nouvelle API
//     })
//   )

//   private async getStore(store_id: string, response: HttpContext['response']) {

//     if (!store_id) {
//       return response.badRequest({ message: 'Store ID is required' })
//     }

//     const store = await Store.find(store_id)
//     if (!store) {
//       return response.notFound({ message: 'Store not found' })
//     }
//     return store;
//   }

//   /*************  CONTROLLER METHODS   ********************** */
//   async create_store({ request, response, auth, bouncer }: HttpContext) { // Injecter bouncer
//     const user = await auth.authenticate(); // Assure l'authentification

//     // Vérification des permissions AVANT validation/traitement
//     await bouncer.authorize('createStore'); // Vérifie si l'utilisateur connecté peut créer un store


//     // --- 2. Validation du payload ---
//     let payload: any
//     try {
//       payload = await request.validateUsing(StoresController.createStoreValidator)
//     } catch (error) {
//       return response.badRequest(error.message)
//     }

//     // --- 3. Logique de création via le service ---
//     const result = await StoreService.createAndRunStore({
//       ...payload,
//       userId: user.id,
//     })

//     // --- 4. Réponse HTTP ---
//     if (result.success && result.store) {
//       return response.created(
//         result.store.serialize({
//           fields: { omit: ['is_running'] },
//         })
//       )
//     } else {
//       console.error("Erreur lors de la création du store:", result.logs.errors)
//       return response.internalServerError({
//         message: 'La création du store a échoué. Veuillez réessayer ou contacter le support.',
//         errors: result.logs.errors.find((e) => e.includes?.('Nom de store')),
//       })
//     }
//   }
//   /**
//    * Récupère une liste paginée de stores.
//    * GET /stores
//    * GET /stores?user_id=xxx (Admin only)
//    * GET /stores?name=yyy
//    * GET /stores?order_by=name_asc
//    */
//   async get_stores({ request, response, auth, bouncer }: HttpContext) {
//     const user = await auth.authenticate()
//     await bouncer.authorize('viewStoreList');


//     let { page, limit, order_by, name, user_id } = request.qs()
//     page = parseInt(page ?? '1')
//     limit = parseInt(limit ?? '25')


//     try {
//       const query = Store.query().preload('currentApi').preload('currentTheme'); // Précharge relations utiles

//       if (user_id) {

//         await user.load('roles');

//         if (!CHECK_ROLES.isManager(user)) {
//           throw new Error(' "user_id" is an Admin option')
//         }

//         if (user_id == 'all') {
//           console.log(`ADMIN ACTION get_stores (${JSON.stringify(request.qs())})`);
          
//         } else {
//           query.where('user_id', user_id);
//         }

//       } else {
//         query.where('user_id', user.id);
//       }

//       if (name) {
//         const searchTerm = `%${name.toLowerCase()}%`
//         query.where((q) => {
//           q.whereRaw('LOWER(stores.name) LIKE ?', [searchTerm])
//             .orWhereRaw('LOWER(stores.description) LIKE ?', [searchTerm])
//         })
//       }


//       if (order_by) {
//         applyOrderBy(query, order_by, Store.table)
//       }

//       const stores = await query.paginate(page, limit);

//       return response.ok(stores);

//     } catch (error) {
//       console.error("Erreur get_stores:", error);
//       return response.internalServerError({ message: "Erreur serveur lors de la récupération des stores." });
//     }
//   }


//   /**
//    * Récupère les détails d'un store spécifique.
//    * GET /stores/:id
//    */
//   async get_store({ params, response, auth, bouncer }: HttpContext) {
//     const user = await auth.authenticate();
//     const storeId = params.id;
//     await bouncer.authorize('viewStoreList');

//     try {
//       const store = await Store.query()
//         .where('id', storeId)
//         .preload('currentApi')
//         .preload('currentTheme')
//         .first();

//       if (!store) {
//         return response.notFound({ message: "Store non trouvé." });
//       }


//       if (store.user_id !== user.id && !CHECK_ROLES.isManager(user)) {
//         return response.forbidden({ message: "Accès non autorisé à ce store." });
//       }

//       return response.ok(store);

//     } catch (error) {
//       console.error("Erreur get_store:", error);
//       return response.internalServerError({ message: "Erreur serveur lors de la récupération du store." });
//     }
//   }


//   /**
//    * Met à jour les informations de base d'un store.
//    * PUT /stores/:id
//    * PATCH /stores/:id
//    */
//   async update_store({ params, request, response, bouncer }: HttpContext) {
//     // const user = await auth.authenticate();
//     const storeId = params.id;


//     let payload: any;
//     try {
//       payload = await request.validateUsing(StoresController.updateStoreInfoValidator);
//     } catch (error) {
//       return response.badRequest(error.message)
//     }

//     const store = await this.getStore(storeId, response);
//     if (!store) return
//     await bouncer.authorize('updateStore', store);

//     const result = await StoreService.updateStoreInfo(store, payload);

//     if (result?.success) {
//       return response.ok(result.store?.serialize({ fields: { omit: ['is_running'] } }));
//     } else {
//       console.error(`Erreur update_store pour ${storeId}:`, result); // 'result' serait null ici... Log depuis le service.
//       return response.internalServerError({ message: "La mise à jour a échoué.", error: result.logs.errors.find(f => f.toLowerCase().includes('nom')) });
//       // Ou 409 si l'erreur était un nom dupliqué (gérer dans le service et retourner un code d'erreur?)
//     }
//   }

//   /**
//    * Supprime un store.
//    * DELETE /stores/:id
//    */
//   async delete_store({ params, response, bouncer }: HttpContext) {
//     // const user = await auth.authenticate();


//     const storeId = params.id;

//     const store = await this.getStore(storeId, response);
//     if (!store) return
//     await bouncer.authorize('deleteStore', store);

//     const result = await StoreService.deleteStoreAndCleanup(store);

//     if (result.success) {
//       return response.noContent();
//     } else {
//       console.error(`Erreur delete_store ${storeId}:`, result.logs.errors);
//       return response.internalServerError({ message: "La suppression a échoué." });
//     }
//   }

//   async update_store_status({ params, request, response, bouncer }: HttpContext) {
//     // const user = await auth.authenticate();
//     const storeId = params.id;
//     // Validation
//     const statusValidator = vine.compile(vine.object({ is_active: vine.boolean() }));
//     let payload: any;
//     try { payload = await request.validateUsing(statusValidator); }
//     catch (error) {
//       return response.badRequest(error)
//     }

//     const store = await this.getStore(storeId, response);
//     if (!store) return
//     await bouncer.authorize('manageStoreState', store);

//     const result = await StoreService.setStoreActiveStatus(store, payload.is_active);

//     if (result.success && result.store) {
//       return response.ok(result.store);
//     } else {
//       console.error(`Erreur update_store_status ${storeId}:`, result.logs.errors);
//       const isDefaultError = result.logs.errors.some((err: any) => err.message?.includes("Désactivation thème par défaut interdite"));
//       if (isDefaultError) return response.badRequest({ message: "Désactivation du thème par défaut interdite." });
//       return response.internalServerError({ message: "Échec MàJ statut thème." });
//     }
//   }
//   // --- Actions spécifiques sur l'état/infrastructure ---

//   /**
//    * Arrête le service d'un store (scale 0).
//    * POST /stores/:id/stop
//    */
//   async stop_store({ params, response, bouncer }: HttpContext) {
//     // const user = await auth.authenticate();
//     const storeId = params.id;

//     const store = await this.getStore(storeId, response);
//     if (!store) return
//     await bouncer.authorize('manageStoreActivation', store);


//     const result = await StoreService.stopStoreService(store);
//     if (result.success) {
//       return response.ok({ message: "Demande d'arrêt envoyée." });
//     } else {
//       console.error(`Erreur stop_store ${storeId}:`, result.logs.errors);
//       return response.internalServerError({ message: "Échec de l'arrêt." });
//     }
//   }

//   /**
//    * Démarre le service d'un store (scale 1).
//    * POST /stores/:id/start
//    */
//   async start_store({ params, response, bouncer }: HttpContext) {
//     // const user = await auth.authenticate();
//     const storeId = params.id;

//     const store = await this.getStore(storeId, response);
//     if (!store) return
//     await bouncer.authorize('manageStoreActivation', store);


//     const result = await StoreService.startStoreService(store);
//     if (result.success) {
//       return response.ok({ message: "Demande de démarrage envoyée." });
//     } else {
//       console.error(`Erreur start_store ${storeId}:`, result.logs.errors);
//       return response.internalServerError({ message: "Échec du démarrage." });
//     }
//   }

//   /**
//    * Redémarre le service d'un store.
//    * POST /stores/:id/restart
//    */
//   async restart_store({ params, response, bouncer }: HttpContext) {
//     // const user = await auth.authenticate();
//     const storeId = params.id;
//     // Vérifier permissions
//     const store = await this.getStore(storeId, response);
//     if (!store) return
//     await bouncer.authorize('manageStoreActivation', store);


//     const result = await StoreService.restartStoreService(store);
//     if (result.success) {
//       return response.ok({ message: "Demande de redémarrage envoyée." });
//     } else {
//       console.error(`Erreur restart_store ${storeId}:`, result.logs.errors);
//       return response.internalServerError({ message: "Échec du redémarrage." });
//     }
//   }

//   /**
//    * Met à l'échelle le service d'un store.
//    * POST /stores/:id/scale
//    * Body: { "replicas": 3 }
//    */
//   async scale_store({ params, request, response, bouncer }: HttpContext) {
//     // const user = await auth.authenticate(); // TODO: Admin only?
//     const storeId = params.id;
//     // Vérifier permissions (Admin?)

//     const store = await this.getStore(storeId, response);
//     if (!store) return
//     await bouncer.authorize('manageStoreActivation', store);


//     // Validation
//     const scaleValidator = vine.compile(vine.object({ replicas: vine.number().min(0) }));
//     let payload: any;
//     try { payload = await request.validateUsing(scaleValidator); }
//     catch (error) {
//       return response.badRequest(error.message)
//     }

//     const result = await StoreService.scaleStoreService(store, payload.replicas);
//     if (result.success) {
//       return response.ok({ message: `Demande de mise à l'échelle à ${payload.replicas} envoyée.` });
//     } else {
//       console.error(`Erreur scale_store ${storeId}:`, result.logs.errors);
//       return response.internalServerError({ message: "Échec de la mise à l'échelle." });
//     }
//   }

//   // --- Gestion domain_names / Thème / API ---

//   /**
//    * Ajoute un domain_name custom à un store.
//    * POST /stores/:id/domains
//    * Body: { "domain_name": "mon-site.com" }
//    */
//   async add_store_domain({ params, request, response, bouncer }: HttpContext) {
//     // const user = await auth.authenticate();
//     const storeId = params.id;

//     const store = await this.getStore(storeId, response);
//     if (!store) return
//     await bouncer.authorize('manageStoreDomains', store);

//     // TODO: Limite de domain_names par plan

//     // Validation
//     let payload: any;
//     try { payload = await request.validateUsing(StoresController.domainValidator); }
//     catch (error) {
//       return response.badRequest(error)
//     }

//     const result = await StoreService.addStoreDomain(store, payload.domain_name);
//     if (result.success && result.store) {
//       return response.ok(result.store.serialize({ fields: { omit: ['is_running'] } }));
//     } else {
//       console.error(`Erreur add_domain ${storeId}:`, result.logs.errors);
//       return response.internalServerError({ message: "Échec ajout domain_name." });
//       // Ou 409 si domain_name déjà pris globalement?
//     }
//   }

//   /**
//    * Supprime un domain_name custom d'un store.
//    * DELETE /stores/:id/domains
//    * Body: { "domain_name": "mon-site.com" } // Ou dans QueryString? Préférer body pour DELETE avec data
//    */
//   async remove_store_domain({ params, request, response, bouncer }: HttpContext) {
//     // const user = await auth.authenticate();
//     const storeId = params.id;

//     console.log(request.params(), request.body(), request.qs());

//     const store = await this.getStore(storeId, response);
//     if (!store) return
//     await bouncer.authorize('manageStoreDomains', store);

//     // Validation
//     let payload: any;
//     try { payload = await request.validateUsing(StoresController.domainValidator); } // Réutilise le même validateur
//     catch (error) {
//       return response.badRequest(error)
//     }

//     const result = await StoreService.removeStoreDomain(store, payload.domain_name);
//     if (result.success && result.store) {
//       return response.ok(result.store.serialize({ fields: { omit: ['is_running'] } }));
//     } else {
//       console.error(`Erreur remove_domain ${storeId}:`, result.logs.errors);
//       return response.internalServerError({ message: "Échec suppression domain_name." });
//     }
//   }


//   /**
//    * Change le thème actif d'un store.
//    * PUT /stores/:id/theme
//    * Body: { "theme_id": "theme-unique-id" | null }
//    */
//   async change_store_theme({ params, request, response, bouncer }: HttpContext) {
//     // const user = await auth.authenticate();
//     const storeId = params.id;

//     const store = await this.getStore(storeId, response);
//     if (!store) return
//     await bouncer.authorize('manageStoreTheme', store);

//     // Validation
//     let payload: any;
//     try { payload = await request.validateUsing(StoresController.changeThemeValidator); }
//     catch (error) {
//       return response.badRequest(error.message)
//     }

//     const result = await StoreService.changeStoreTheme(store, payload.theme_id);
//     if (result) { // Le service retourne le store mis à jour ou null
//       return response.ok(result.store?.serialize({ fields: { omit: ['is_running'] } }));
//     } else {
//       // Les logs d'erreur sont dans le service
//       return response.internalServerError({ message: "Échec changement thème." });
//       // Peut être 404 si thème_id non trouvé, 403 si thème non autorisé, 500 sinon.
//     }
//   }

//   /**
//    * Change la version d'API utilisée par un store.
//    * PUT /stores/:id/api
//    * Body: { "api_id": "api-version-id" }
//    */
//   async change_store_api({ params, request, response, bouncer }: HttpContext) {
//     // const user = await auth.authenticate();
//     const storeId = params.id;


//     const store = await this.getStore(storeId, response);
//     if (!store) return
//     await bouncer.authorize('manageStoreApi', store);

//     // Validation
//     let payload: any;
//     try { payload = await request.validateUsing(StoresController.changeApiValidator); }
//     catch (error) {
//       return response.badRequest(error.message)
//     }

//     const result = await StoreService.updateStoreApiVersion(store, payload.api_id);
//     if (result) {
//       return response.ok(result.store?.serialize({ fields: { omit: ['is_running'] } }));
//     } else {
//       return response.internalServerError({ message: "Échec MàJ version API." });
//       // Peut être 404 si api_id non trouvé
//     }
//   }

//   /**
//    * Vérifie si un nom de store est disponible.
//    * GET /stores/available-name?name=new-store-name
//    */
//   async available_name({ request, response }: HttpContext) {
//     const name = request.qs().name;
//     if (!name || typeof name !== 'string') {
//       return response.badRequest({ message: "Paramètre 'name' manquant ou invalide." });
//     }
//     // Validation rapide format (identique à la création)
//     if (!/^[a-z0-9-]+$/.test(name)) {
//       return response.badRequest({ message: "Format de nom invalide. [a-z0-9-]" });
//     }

//     const exist = await Store.findBy('name', name);
//     return response.ok({ is_available_name: !exist });
//   }

//   // --- Endpoints non migrés / A revoir ---
//   /*
//     async test_store... // Qu'est-ce que ça testait exactement? Peut-être GET /stores/:id/status?
//     async can_manage_store... // Logique intégrée dans chaque méthode via auth/vérification user_id
//   */

// } // Fin de la classe StoresController


// // app/controllers/http/themes_controller.ts

// import type { HttpContext } from '@adonisjs/core/http'
// import vine from '@vinejs/vine'
// import ThemeService from '#services/ThemeService'
// import Theme from '#models/theme' // Pour typer le retour
// import { v4 } from 'uuid'

// export default class ThemesController {

//     // TODO: Ajouter Middleware d'authentification et de vérification Admin pour toutes ces routes

//     // --- Schémas de Validation Vine ---

//     /**
//      * Validateur pour la création/mise à jour de thème
//      */
//     static themePutValidator = vine.compile(
//         vine.object({
//             // ID sera dans les params pour update, fourni ici pour create/update si clé sémantique
//             id: vine.string().trim().minLength(3).maxLength(50).optional(), // Optionnel si create/update basé sur param route
//             name: vine.string().trim().minLength(3).maxLength(100).optional(),
//             description: vine.string().trim().maxLength(500).nullable().optional().optional(),
//             docker_image_name: vine.string().trim().regex(/^[a-z0-9_/-]+$/).optional(), // Format nom image docker
//             docker_image_tag: vine.string().trim().regex(/^[\w.-]+$/).maxLength(50).optional(), // Format tag docker
//             internal_port: vine.number().positive().optional(),
//             source_path: vine.string().trim().url().nullable().optional(), // Ou juste string libre?
//             is_public: vine.boolean().optional(),
//             is_active: vine.boolean().optional(),
//             is_default: vine.boolean().optional(),
//             // is_default, is_running sont gérés par le service/logique interne
//         })
//     )

//     static themePostValidator = vine.compile(
//         vine.object({
//             // ID sera dans les params pour update, fourni ici pour create/update si clé sémantique
//             name: vine.string().trim().minLength(3).maxLength(100),
//             description: vine.string().trim().maxLength(500).nullable().optional(),
//             docker_image_name: vine.string().trim().regex(/^[a-z0-9_/-]+$/), // Format nom image docker
//             docker_image_tag: vine.string().trim().regex(/^[\w.-]+$/).maxLength(50), // Format tag docker
//             internal_port: vine.number().positive(),
//             source_path: vine.string().trim().url().nullable().optional(), // Ou juste string libre?
//             is_public: vine.boolean().optional(),
//             is_active: vine.boolean().optional(),
//             is_default: vine.boolean().optional(),
//             // is_default, is_running sont gérés par le service/logique interne
//         })
//     )
//     /**
//      * Validateur pour la mise à jour du tag/version
//      */
//     static updateTagValidator = vine.compile(
//         vine.object({
//             docker_image_tag: vine.string().trim().regex(/^[\w.-]+$/).maxLength(50),
//         })
//     )

//     async getTheme(theme_id: string, response: HttpContext['response']) {

//         if (!theme_id) {
//             return response.badRequest({ message: 'Theme ID is required' })
//         }

//         const theme = await Theme.find(theme_id)
//         if (!theme) {
//             return response.notFound({ message: 'Theme not found' })
//         }
//         return theme;
//     }
//     // --- Méthodes du Contrôleur (Supposent Admin Authentifié) ---

//     /**
//      * Crée ou met à jour un thème et lance/met à jour son service.
//      * POST /themes
//      * PUT /themes/:id
//      */
//     async upsert_theme({ request, response, params }: HttpContext) {
//         const themeIdFromParams = params.id;
//         let payload: any;
//         let isUpdate = !!themeIdFromParams; // Vrai si PUT/PATCH avec :id

//         try {
//             // Choisir le bon validateur
//             if (isUpdate) {
//                 payload = await request.validateUsing(ThemesController.themePutValidator);
//             } else {
//                 payload = await request.validateUsing(ThemesController.themePostValidator);
//             }
//         } catch (error) {
//             return response.badRequest(error.message);
//         }

//         // 1. Validation

//         // Détermine l'ID : depuis les params (PUT) ou le body (POST avec ID sémantique)
//         let themeId = themeIdFromParams ?? v4()


//         // Si ID dans body et dans params, ils doivent correspondre pour PUT
//         if (themeIdFromParams && payload.id && themeIdFromParams !== payload.id) {
//             return response.badRequest({ message: "L'ID du thème dans l'URL et le corps de la requête ne correspondent pas." })
//         }
//         // Assigne l'ID final au payload pour l'appel service
//         payload.id = themeId;

//         // 2. Appel Service (gère create ou update + lancement Swarm)
//         const result = await ThemeService.createOrUpdateAndRunTheme(payload);

//         // 3. Réponse
//         if (result.theme) {
//             return response.status(!isUpdate ? 201 : 200).send(result.theme);
//         } else {
//             console.error(`Erreur upsert_theme ${themeId}:`, result.logs.errors);
//             // Code 409 si l'ID existait déjà lors d'un POST qui n'est pas censé MAJ?
//             // La logique est dans le service pour le moment.
//             return response.internalServerError({ message: "Échec création/MàJ thème." });
//         }
//     }

//     /**
//      * Récupère la liste des thèmes (potentiellement filtrée).
//      * GET /themes
//      * GET /themes?public=true&active=true
//      */
//     async get_themes({ request, response }: HttpContext) {
//         const qs = request.qs();
//         const page = parseInt(qs.page ?? '1');
//         const limit = parseInt(qs.limit ?? '10');
//         const filterIsPublic = qs.public ? (qs.public === 'true') : undefined;
//         const filterIsActive = qs.active ? (qs.active === 'true') : undefined;
//         const filterIsDefault = qs.default ? (qs.default === 'true') : undefined;

//         try {
//             const query = Theme.query().orderBy('name');

//             if (filterIsPublic !== undefined) query.where('is_public', filterIsPublic);
//             if (filterIsActive !== undefined) query.where('is_active', filterIsActive);
//             if (filterIsDefault !== undefined) query.where('is_default', filterIsDefault);

//             const themes = await query.paginate(page, limit);
//             return response.ok(themes.serialize()); // Serialize par défaut

//         } catch (error) {
//             console.error("Erreur get_themes:", error);
//             return response.internalServerError({ message: "Erreur serveur lors de la récupération des thèmes." });
//         }
//     }


//     /**
//      * Récupère les détails d'un thème spécifique.
//      * GET /themes/:id
//      */
//     async get_theme({ params, response }: HttpContext) {
//         const themeId = params.id;
//         try {
//             const theme = await Theme.find(themeId);
//             if (!theme) return response.notFound({ message: "Thème non trouvé." });
            
//             return response.ok(theme); // Renvoie tout l'objet par défaut
//         } catch (error) {
//             console.error(`Erreur get_theme ${themeId}:`, error);
//             return response.internalServerError({ message: "Erreur serveur." });
//         }
//     }


//     /**
//      * Supprime un thème.
//      * DELETE /themes/:id
//      * DELETE /themes/:id?force=true
//      */
//     async delete_theme({ params, request, response,bouncer }: HttpContext) {
//         const themeId = params.id;
//         const forceDelete = request.qs().force === 'true';

//         const theme = await this.getTheme(themeId, response);
//         if (!theme) return
//         await bouncer.authorize('updateTheme');

//         const result = await ThemeService.deleteThemeAndCleanup(theme, forceDelete);

//         if (result.success) {
//             return response.noContent();
//         } else {
//             console.error(`Erreur delete_theme ${themeId}:`, result.logs.errors);
//             // Vérifier si l'erreur est parce que le thème est utilisé (si !force)
//             const isUsedError = result.logs.errors.some((err: any) => err.message?.includes("est utilisé par le store"));
//             if (isUsedError && !forceDelete) {
//                 return response.conflict({ message: "Thème utilisé, suppression annulée. Utilisez ?force=true pour forcer." });
//             }
//             if (result.theme?.is_default) {
//                 return response.badRequest({ message: "Impossible de supprimer le thème par défaut." })
//             }
//             return response.internalServerError({ message: "Échec de la suppression." });
//         }
//     }

//     // --- Actions sur l'état/version ---

//     /**
//      * Met à jour le tag d'image d'un thème (rolling update).
//      * PUT /themes/:id/version
//      * Body: { "docker_image_tag": "v2.2.0" }
//      */
//     async update_theme_version({ params, request, response, bouncer }: HttpContext) {
//         const themeId = params.id;

//         const theme = await this.getTheme(themeId, response);
//         if (!theme) return
//         await bouncer.authorize('updateTheme');
//         // Validation
//         let payload: any;
//         try { payload = await request.validateUsing(ThemesController.updateTagValidator); }
//         catch (error) {
//             return response.badRequest(error)
//         }

//         const result = await ThemeService.updateThemeVersion(theme, payload.docker_image_tag);

//         if (result.success && result.theme) {
//             return response.ok(result.theme);
//         } else {
//             console.error(`Erreur update_theme_version ${themeId}:${payload.docker_image_tag}`, result.logs.errors);
//             return response.internalServerError({ message: "Échec mise à jour version." });
//         }
//     }

//     /**
//      * Active ou désactive un thème globalement.
//      * PUT /themes/:id/status
//      * Body: { "is_active": true | false }
//      */
//     async update_theme_status({ params, request, response , bouncer}: HttpContext) {
//         const themeId = params.id;

//         // Validation
//         const statusValidator = vine.compile(vine.object({ is_active: vine.boolean() }));
//         let payload: any;
//         try { payload = await request.validateUsing(statusValidator); }
//         catch (error) {
//             return response.badRequest(error)
//         }
//         const theme = await this.getTheme(themeId, response);
//         if (!theme) return
//         await bouncer.authorize('updateTheme');

//         const result = await ThemeService.setThemeActiveStatus(theme, payload.is_active);

//         if (result.success && result.theme) {
//             return response.ok(result.theme);
//         } else {
//             console.error(`Erreur update_theme_status ${themeId}:`, result.logs.errors);
//             const isDefaultError = result.logs.errors.some((err: any) => err.message?.includes("Désactivation thème par défaut interdite"));
//             if (isDefaultError) return response.badRequest({ message: "Désactivation du thème par défaut interdite." });
//             return response.internalServerError({ message: "Échec MàJ statut thème." });
//         }
//     }


//     async update_theme_default({ params, response, bouncer }: HttpContext) {

//         const themeId = params.id;

//         const theme = await this.getTheme(themeId, response);
//         if (!theme) return
//         await bouncer.authorize('updateTheme');

//         const result = await ThemeService.setDefaultTheme(theme);

//         if (result.success && result.theme) {
//             return response.ok(result.theme);
//         } else {
//             console.error(`Erreur update_theme_default ${themeId}:`, result.clientMessage);
//             return response.internalServerError({ message: "Échec MàJ Default thème." });
//         }
//     }

//     /**
//      * Démarre le service d'un thème.
//      * POST /themes/:id/start
//      */
//     async start_theme({ params, response,bouncer }: HttpContext) {
//         const themeId = params.id;

//         const theme = await this.getTheme(themeId, response);
//         if (!theme) return
//         await bouncer.authorize('updateTheme');
        
//         const result = await ThemeService.startThemeService(theme); // Démarre 1 réplique par défaut
        
//         if (result.success) {
//             return response.ok({ message: "Demande de démarrage envoyée." });
//         } else {
//             console.error(`Erreur start_theme ${themeId}:`, result.logs.errors);
//             return response.internalServerError({ message: "Échec démarrage thème." });
//         }
//     }

//     /**
//      * Arrête le service d'un thème.
//      * POST /themes/:id/stop
//      */
//     async stop_theme({ params, response,bouncer }: HttpContext) {
//         const themeId = params.id;

//         const theme = await this.getTheme(themeId, response);
//         if (!theme) return
//         await bouncer.authorize('updateTheme');

//         const result = await ThemeService.stopThemeService(theme);
//         if (result.success) {
//             return response.ok({ message: "Demande d'arrêt envoyée." });
//         } else {
//             console.error(`Erreur stop_theme ${themeId}:`, result.logs.errors);
//             return response.internalServerError({ message: "Échec arrêt thème." });
//         }
//     }

//     /**
//      * Redémarre le service d'un thème.
//      * POST /themes/:id/restart
//      */
//     async restart_theme({ params, response , bouncer}: HttpContext) {
//         const themeId = params.id;

//         const theme = await this.getTheme(themeId, response);
//         if (!theme) return
//         await bouncer.authorize('updateTheme');

//         const result = await ThemeService.restartThemeService(theme);
//         if (result.success) {
//             return response.ok({ message: "Demande de redémarrage envoyée." });
//         } else {
//             console.error(`Erreur restart_theme ${themeId}:`, result.logs.errors);
//             return response.internalServerError({ message: "Échec redémarrage thème." });
//         }
//     }

//     // TODO: Ajouter un endpoint pour définir LE thème par défaut? (Ex: POST /themes/set-default/:id)
//     // TODO: Endpoint pour scaler un thème à N répliques? POST /themes/:id/scale { replicas: N }

// } // Fin classe ThemesController


// // app/controllers/http/users_controller.ts
// import type { HttpContext } from '@adonisjs/core/http'
// import vine from '@vinejs/vine'
// import User from '#models/user'
// import hash from '@adonisjs/core/services/hash'
// import Store from '#models/store'
// import StoreService from '#services/StoreService'
// // Importe les helpers de gestion de fichiers si tu les utilises ici
// // import { updateFiles } from './Tools/FileManager/UpdateFiles.js' // Chemin à adapter

// export default class UsersController {

//     // --- Validateurs ---

//     static updateProfileValidator = vine.compile(
//         vine.object({
//             fullName: vine.string().trim().minLength(2).optional(),
//             phone: vine.string().trim().nullable().optional(), // Accepte string ou null
//             // Les 'photos' seraient gérées séparément si upload, ou ici si URL
//             // photos: vine.array(vine.string().url()).optional() // Si on passe un tableau d'URLs
//         })
//     )

//     // Validateur si on permet de changer le mot de passe depuis le profil
//     static updatePasswordValidator = vine.compile(
//         vine.object({
//             currentPassword: vine.string(), // L'utilisateur doit fournir l'ancien
//             newPassword: vine.string().minLength(8).confirmed()
//                 .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/),
//         })
//     )

//     // --- Méthodes du Contrôleur ---

//     /**
//      * Met à jour le profil de l'utilisateur connecté.
//      * PUT /auth/me  (Ou PUT /users/me, si on change la route)
//      */
//     async updateMe({ request, response, auth }: HttpContext) {
//         const user = auth.getUserOrFail(); // L'utilisateur est déjà authentifié par le middleware

//         // 1. Validation des données du profil (hors mot de passe, photos upload)
//         const payload = await request.validateUsing(UsersController.updateProfileValidator);

//         // Applique les mises à jour simples
//         let hasChanges = false;
//         if (payload.fullName && payload.fullName !== user.full_name) {
//             user.full_name = payload.fullName;
//             hasChanges = true;
//         }
//         if (payload.phone !== undefined && payload.phone !== user.phone) {
//             user.phone = payload.phone; // Peut être string ou null
//             hasChanges = true;
//         }

//         // --- GESTION DES PHOTOS (si tu l'intègres ici) ---
//         // Exemple si on reçoit des URLS ou qu'on gère l'upload ici
//         // C'est souvent mieux dans un endpoint dédié (/me/avatar par exemple)
//         /*
//         const uploadedPhotos = []; // Remplacer par la logique d'upload de ton service File
//         if (uploadedPhotos.length > 0) {
//             // Logique pour remplacer ou ajouter aux photos existantes
//             user.photos = uploadedPhotos;
//             hasChanges = true;
//         }
//         */

//         // 2. Sauvegarde si des changements ont eu lieu
//         if (hasChanges) {
//             try {
//                 await user.save();
//                 // Doit-on recharger les rôles ici ? Probablement pas pour un update de profil
//                 // await user.load('roles');
//             } catch (error) {
//                 console.error("Erreur sauvegarde profil user:", error);
//                 return response.internalServerError({ message: "Erreur lors de la sauvegarde du profil." });
//             }
//         } else {
//             // Si aucun changement détecté, retourne 200 OK avec les données actuelles
//         }

//         // Recharger les rôles avant de renvoyer, au cas où
//         await user.load('roles');
//         return response.ok({
//             user: user.serialize({ fields: { omit: ['password'] } })
//         });
//     }


//     /**
//      * Permet à l'utilisateur connecté de changer son mot de passe.
//      * PUT /auth/me/password (Nouvelle route suggérée)
//      */
//     async updateMyPassword({ request, response, auth }: HttpContext) {
//         const user = auth.getUserOrFail();

//         // Validation (ancien mot de passe, nouveau + confirmation)
//         const payload = await request.validateUsing(UsersController.updatePasswordValidator);

//         // Vérifier l'ancien mot de passe
//         if (!(await hash.verify(user.password, payload.currentPassword))) {
//             // Pour des raisons de sécurité, on ne dit pas *exactement* ce qui est faux
//             return response.badRequest({ message: 'Mot de passe actuel incorrect.' });
//             // OU (plus spécifique mais moins sûr)
//             // return response.badRequest({
//             //    errors: [{ field: 'currentPassword', rule: 'invalid', message: 'Mot de passe actuel incorrect.' }]
//             // });
//         }

//         // Mettre à jour avec le nouveau mot de passe (le hook beforeSave s'occupera du hash)
//         user.password = payload.newPassword;
//         try {
//             await user.save();
//         } catch (error) {
//             console.error("Erreur changement mot de passe:", error);
//             return response.internalServerError({ message: "Erreur lors de la mise à jour du mot de passe." });
//         }

//         // Peut-être déconnecter toutes les autres sessions/tokens après changement de mdp?
//         // await User.accessTokens.deleteAll(user);

//         return response.ok({ message: 'Mot de passe mis à jour avec succès.' });
//     }

//     /**
//      * Supprime le compte de l'utilisateur connecté.
//      * **ACTION DESTRUCTIVE**
//      * DELETE /auth/me (Ou DELETE /users/me)
//      */
//     async deleteMe({ response, auth }: HttpContext) {
//         const user = auth.getUserOrFail();

//         // !! LOGIQUE IMPORTANTE DE NETTOYAGE !!
//         // Que faire des ressources liées à l'utilisateur ?
//         // - Stores : Les supprimer ? Les désactiver ? Les transférer ? => Utilise StoreService?
//         // - Thèmes créés : Les supprimer ? Les garder anonymes ?
//         // - Affiliations : Clôturer ?
//         // - Supprimer les tokens, les infos de profil, etc.

//         // Exemple Simplifié: On supprime juste l'utilisateur, les cascades BDD feront le reste
//         // MAIS CE N'EST PAS ASSEZ, il faut gérer les services externes (Swarm, Nginx...) !
//         try {
//             console.warn(`Demande de suppression du compte utilisateur ${user.id} (${user.email})`);

//             // *** ETAPE CRUCIALE : Itérer sur les stores possédés et les supprimer proprement ***
//             const storesOwned = await Store.query().where('user_id', user.id);
//             console.log(`   -> Trouvé ${storesOwned.length} store(s) à supprimer...`);
//             for (const store of storesOwned) {
//                 console.log(`   -> Suppression du store ${store.id}...`);
//                 // Utilise le service pour un cleanup complet (Swarm, Nginx, DB...)
//                 await StoreService.deleteStoreAndCleanup(store.id);
//                 console.log(`   -> Store ${store.id} supprimé.`);
//             }

//             // Supprimer tous les tokens d'accès restants
//             const tokens = await User.accessTokens.all(user);
//             for (const token of tokens) {
//                 await User.accessTokens.delete(user, token.identifier);
//             }

//             // Supprimer l'utilisateur (les cascades BDD devraient gérer user_roles, social_accounts)
//             await user.delete();

//             console.log(`   -> Utilisateur ${user.id} supprimé de la BDD.`);

//             return response.noContent(); // Succès

//         } catch (error) {
//             console.error(`Erreur lors de la suppression du compte ${user.id}:`, error);
//             // Tenter de donner une erreur un peu plus utile si possible
//             return response.internalServerError({ message: "Erreur lors de la suppression du compte. Veuillez contacter le support." });
//         }
//     }


//     /**
//      * Déconnecte l'utilisateur de tous les appareils en supprimant tous ses tokens.
//      * POST /auth/logout-all
//      */
   
//     public async logoutAllDevices({ auth, response }: HttpContext) {

//         const user = await auth.authenticate();

//         const tokens = await User.accessTokens.all(user);
//         for (const token of tokens) {
//             await User.accessTokens.delete(user, token.identifier);
//         }

//         return response.ok({ message: 'Déconnexion de tous les appareils réussie.' });
//     }

// } // Fin UsersController






// ===>> et enfin les  fonction utils et bouncers

// //app/abilities/main.ts
// import {Bouncer} from '@adonisjs/bouncer'
// // import { policies } from '#policies/main' // Garde ça, même si on n'utilise pas les classes Policy tout de suite
// import User from '#models/user'
// import Store from '#models/store'
// import { ROLES } from '#models/role'
// // import Theme from '#models/theme'
// // import Api from '#models/api'

// // Helper pour rendre le code plus lisible

// const hasRole =  (user: User, roleName:keyof typeof ROLES) => {
//     user.roles = user.roles ?? [];
//     return user.roles.some(role => role.name === roleName)
//   }
  
// const isAdmin = (user: User) =>hasRole(user,'ADMIN') || user.email == 'sublymus@gmail.com' || user.email == 'sablymus@gmail.com'
// const isModerator = (user: User) =>hasRole(user,'MODERATOR')
// const isOwnerRole = (user: User) =>hasRole(user,'OWNER')
// const isCreatorRole = (user: User) =>hasRole(user,'CREATOR')
// const isAffiliateRole = (user: User) =>hasRole(user,'AFFILIATE')

// const isManager = (user: User) => isAdmin(user) || isModerator(user)

// export  const CHECK_ROLES = {
//   isAdmin,
//   isModerator,
//   isOwnerRole,
//   isCreatorRole,
//   isAffiliateRole,
//   isManager
// } 

// /**
//  * Export des abilities définies globalement.
//  * La première fonction define reçoit le User connecté.
//  * La deuxième fonction (optionnelle) reçoit la ou les ressources concernées.
//  */

// // --- Abilities Stores ---

// // Peut voir la liste complète des stores (admin/modo) ou juste les siens (owner)
// export const viewStoreList = Bouncer.ability((user: User) => {
//     // Par défaut, seul l'admin/modo voit tout, mais le contrôleur filtrera pour l'owner
//      return isManager(user) || isOwnerRole(user); // L'owner peut voir la liste (filtrée ensuite)
// })

// // Peut voir les détails d'un store spécifique
// export const viewStore = Bouncer.ability((user: User, store: Store) => {
//      if (isManager(user)) return true; // Admin/Modo voit tout
//      // Owner voit le sien
//      return isOwnerRole(user) && store.user_id === user.id;
// })

// // Peut créer un nouveau store (seulement les users avec le rôle OWNER ?)
// export const createStore = Bouncer.ability((user: User) => {
//      return isOwnerRole(user) || isAdmin(user); // Admin peut créer pour qqn d'autre ? Ou Owner seulement
// })

// // Peut mettre à jour un store
// export const updateStore = Bouncer.ability((user: User, store: Store) => {
//      if (isAdmin(user)) return true; // Admin peut tout éditer
//      // Owner peut éditer le sien
//      return isOwnerRole(user) && store.user_id === user.id;
// })

// // Peut supprimer un store (Restrictif : Admin seulement pour l'instant)
// export const deleteStore = Bouncer.ability((user: User, _store: Store) => {
//     return isAdmin(user);
// })

// // Peut gérer les domaines d'un store
// export const manageStoreDomains = Bouncer.ability((user: User, store: Store) => {
//     if (isAdmin(user)) return true;
//      return isOwnerRole(user) && store.user_id === user.id;
// })

// // Peut gérer le thème d'un store
// export const manageStoreTheme = Bouncer.ability((user: User, store: Store) => {
//     if (isAdmin(user)) return true;
//      return isOwnerRole(user) && store.user_id === user.id;
// })

// // Peut gérer l'API d'un store
// export const manageStoreApi = Bouncer.ability((user: User, store: Store) => {
//     if (isAdmin(user)) return true;
//      return isOwnerRole(user) && store.user_id === user.id;
// })

// // Peut gérer l'état d'un store (start/stop/restart/scale)
// export const manageStoreState = Bouncer.ability((user: User, store: Store) => {
//     // Peut-être que les modérateurs peuvent aussi stop/start/restart ?
//      if (isManager(user)) return true;
//      return isOwnerRole(user) && store.user_id === user.id;
// })

// // Peut activer/désactiver un store (Admin/Modo ?)
// export const manageStoreActivation = Bouncer.ability((user: User, _store: Store) => {
//      return isManager(user); // Seuls Admin/Modo pour l'instant
// })


// // --- Abilities Thèmes (Globaux) ---

// // Peut gérer entièrement les thèmes (CRUD, status, version, défaut...)
// export const manageThemes = Bouncer.ability((user: User) => {
//     // Pour l'instant, Admin seulement, mais on pourrait affiner pour les Modérateurs
//      return isAdmin(user);
//     // Alternative : vérifier permission 'themes:manage' du rôle Moderator
//     // return isAdmin(user) || (isModerator(user) && await user.hasPermission('themes:manage'));
// })

// // Qui peut soumettre/créer un thème (potentiellement Créateur ou Admin)
// export const createTheme = Bouncer.ability((user: User) => {
//     return isCreatorRole(user) || isAdmin(user);
// })

// // Peut mettre à jour UN theme (Peut-être le Créateur pour SES thèmes?)
// // Nécessite d'ajouter 'creatorId' au modèle Theme pour ça.
// // Pour l'instant, on reprend manageThemes (seul Admin/Modo)
// export const updateTheme = Bouncer.ability((user: User, /*theme: Theme*/) => {
//     // Exemple si creatorId existe :
//     // if (isAdmin(user)) return true;
//     // if (isCreatorRole(user) && theme.creatorId === user.id) return true;
//     // return false;
//     return isManager(user); // Simplifié pour l'instant
// })


// // --- Abilities APIs (Définitions Globales) ---

// // Peut gérer entièrement les définitions d'API (CRUD, défaut...)
// export const manageApis = Bouncer.ability((user: User) => {
//     // Admin seulement pour ces actions critiques
//     return isAdmin(user);
// })


// // --- Abilities Actions Admin ---

// // Peut accéder aux endpoints du AdminControlsController
// export const performAdminActions = Bouncer.ability((user: User) => {
//     // Pour l'instant, Admin et Modérateur peuvent voir/faire les actions
//     // mais certaines devraient être limitées à l'Admin (ex: garbage collect delete)
//     return isManager(user);
// })

// // Ability spécifique pour les actions dangereuses (Admin uniquement)
// export const performDangerousAdminActions = Bouncer.ability((user: User) => {
//     return isAdmin(user);
// })


// // --- Abilities Futures ---

// // Peut voir son propre tableau de bord Affilié
// export const viewAffiliateDashboard = Bouncer.ability((user: User) => {
//     return isAffiliateRole(user) || isManager(user);
// })

// // Peut gérer son profil/infos bancaires Affilié
// export const manageAffiliateProfile = Bouncer.ability((user: User) => {
//     return isAffiliateRole(user) || isAdmin(user); // Admin peut aider
// })

// // Peut voir son propre tableau de bord Créateur
// export const viewCreatorDashboard = Bouncer.ability((user: User) => {
//     return isCreatorRole(user) || isManager(user);
// })

// // Peut gérer son profil public Créateur
// export const manageCreatorProfile = Bouncer.ability((user: User) => {
//     return isCreatorRole(user) || isAdmin(user);
// })


// //app/Utils/constantes.ts

// export {DEFAULT_ENV,type REQUIRED_STORE_ENV}

// const DEFAULT_ENV = {
//     TZ: 'UTC',
//     HOST: '0.0.0.0',
//     LOG_LEVEL: 'info',
//     APP_KEY: '4IihbmaY6Fnj2Kf1uXSwWoAc3qA0jlFk',// TODO get api_key// l'utiliter et l'usage
//     NODE_ENV: 'production',
//     DB_HOST: '127.0.0.1',
//     DB_PORT: '5432',
//     REDIS_HOST: '127.0.0.1',
//     REDIS_PORT: '6379',
//     REDIS_PASSWORD: 'redis_w',
//     PORT: '3334',
//     DOCKER_IMAGE: 's_api:v1.0.0', //TODO getCurrentApiVerssion()
//     STORE_NAME: 'STORE_NAME',
//     THEME_ID: 'THEME_ID'
//   }


//   type REQUIRED_STORE_ENV = {
//       SERVICE_ID: string,
//       BASE_ID: string,
//       OWNER_ID: string,
//       TZ?: string,
//       HOST: string,
//       LOG_LEVEL?: string,
//       APP_KEY?: string,
//       NODE_ENV?: string,
//       DB_USER: string,
//       DB_HOST?: string,
//       DB_PORT?: string,
//       DB_PASSWORD: string,
//       DB_DATABASE?: string,
//       REDIS_HOST?: string,
//       REDIS_PORT?: string,
//       REDIS_PASSWORD?: string,
//       GROUPE_NAME: string,
//       PORT: string,
//       EXTERNAL_PORT: string,
//       USER_NAME: string,
//       DOCKER_IMAGE: string,
//       VOLUME_TARGET: string,
//       VOLUME_SOURCE: string,
//       CONTAINER_NAME: string,
//       STORE_NAME?: string, //TODO a suprimer
//       THEME_ID?: string//TODO a suprimer
//   }



// //app/Utils/functions.ts
// import env from "#start/env";
// import { execa } from "execa";
// import { v4 } from "uuid";

// export { waitHere, serviceNameSpace, Logs, writeFile, newContainerName, requiredCall }


// async function waitHere(millis: number) {
//   await new Promise((rev) => setTimeout(() => rev(0), millis))
// }


// function serviceNameSpace(store_id: string) {
//   const BASE_ID = store_id.split('-')[0];
//   return {
//     USER_NAME: `u_${BASE_ID}`,
//     GROUPE_NAME: `g_${BASE_ID}`,
//     DB_DATABASE: `db_${BASE_ID}`,
//     DB_PASSWORD: `w_${BASE_ID}`,
//     BASE_ID,
//     CONTAINER_NAME: `container_${BASE_ID}`,
//     VOLUME_SOURCE: `${env.get('S_API_VOLUME_SOURCE')}/${store_id}`,
//     VOLUME_TARGET: env.get('S_API_VOLUME_TARGET'),
//   }
// }

// function newContainerName(info: { lastName?: string, store_id?: string }) {
//   const diff_id = `${v4().split('-')[0]}`
//   return info.store_id ?
//     `container_${info.store_id.split('-')[0]}_${diff_id}` :
//     `${info.lastName?.split('_').slice(0, 2).join('_')}_${diff_id}`
// }


// async function writeFile(path: string, content: string) {
//   const logs = new Logs(writeFile);

//   try {
//     // Vérification des permissions (sudo n'est peut-être pas nécessaire)
//     await execa('sudo', ['tee', path], { input: content });
//     logs.log(`✅ Écriture du fichier terminée: ${path}`);
//   } catch (error) {
//     logs.notifyErrors(`❌ Erreur pendant l'écriture du fichier`, { path, content }, error);
//     throw error; // Propager l'erreur pour une meilleure gestion en amont
//   }

//   return logs;
// }


// const MapFunctionDelay: any = {}
// async function requiredCall<T>(fn: (...args: any[]) => T, ...params: any[]) {
//   MapFunctionDelay[fn.name] || (MapFunctionDelay[fn.name] = {});
//   MapFunctionDelay[fn.name].fn = fn;
//   MapFunctionDelay[fn.name].params = params || [];
//   MapFunctionDelay[fn.name].needCall = true;
//   if ((MapFunctionDelay[fn.name]?.nextTime || 0) > Date.now()) {
//     return;
//   }

//   // sinon on appelle la fonction avec les params presentes, et on suprmis les params 
//   // on lance un time out  pour le prochain appele 
//   // si au prochain appelle il ya pas de params on n'appelle pas la fonction et c'est fini
//   const launch = () => {
//     if (MapFunctionDelay[fn.name].needCall) {
//       MapFunctionDelay[fn.name].needCall = false;
//       const nextTime = Date.now() + 500;
//       MapFunctionDelay[fn.name].nextTime = nextTime;
//       MapFunctionDelay[fn.name].id = setTimeout(() => {
//         launch();
//       }, 2000);
//       const r = MapFunctionDelay[fn.name].fn?.(...MapFunctionDelay[fn.name].params);
//       MapFunctionDelay[fn.name].params = [];
//       return r
//     }
//   }
//   clearTimeout(MapFunctionDelay[fn.name].id)
//   return launch() as T;
// }


// class Logs {
//   static DEFAULT_NAME = '[No Name Function]';
//   ok = true
//   errors = [] as any[]
//   result = undefined as any
//   name = Logs.DEFAULT_NAME
//   constructor(fn?: Function|string, logs?: { ok?: boolean, errors?: any[] }) {
//     this.errors = logs?.errors ?? [];
//     this.ok = logs?.ok ?? true;
//     this.name = typeof fn == 'string'? fn : fn?.name || Logs.DEFAULT_NAME
//   }

//   log(...errors: any[]) {
//     console.log(...errors);
//     return this
//   }

//   logErrors(...errors: any[]) {
//     this.errors.push(...errors);
//     console.error(...errors);
//     this.ok = false
//     return this
//   }
//   notify(...errors: any[]) {
//     console.error(...errors);
//     //TODO notify admin sse, write in file date.logs
//     return this
//   }
//   notifyErrors(...errors: any[]) {
//     this.errors.push(...errors);
//     console.error(...errors);
//     this.ok = false
//     return this
//   }
//   asOk() {
//     this.ok = true;
//     return this
//   }
//   asNotOk() {
//     this.ok = false;
//     return this
//   }
//   merge(logs: Logs, impact = true) {
//     this.ok = impact ? (logs.ok && this.ok) : this.ok;
//     this.errors.push(...logs.errors);
//     return logs
//   }

//   return(result: any) {
//     this.result = result
//     return this
//   }
// }


// //app/Utils/query.ts
// import { DatabaseQueryBuilderContract } from '@adonisjs/lucid/types/querybuilder'
// export function paginate<T extends { page: number | undefined; limit: number | undefined }>(
//   paginable: T
// ): T & { page: number; limit: number } {
//   let { page, limit } = paginable

//   if (page && page < 1) throw new Error(' page must be between [1 ,n] ')
//   if (limit && limit < 1) throw new Error(' limit must be between [1 ,n] ')

//   page = page ? Number(page) : 1
//   limit = limit ? Number(limit) : 25

//   return {
//     ...paginable,
//     limit,
//     page,
//   }
// }

// export function applyOrderBy(
//     query: DatabaseQueryBuilderContract<any> | any,
//     order_by: string,
//     tableName: string
//   ): any {
//     try {
//       if (order_by === 'date_asc') {
//         query = query.orderBy(`${tableName}.created_at`, 'asc')
//       } else if (order_by === 'date_desc') {
//         query = query.orderBy(`${tableName}.created_at`, 'desc')
//       } else {
//         const orderByParts = order_by.split('_')
//         const column = orderByParts.slice(0, -1).join('_')
//         const mode = orderByParts[orderByParts.length - 1] as 'asc' | 'desc'
  
//         if (['asc', 'desc'].includes(mode)) {
//           query = query.orderBy(column, mode)
//         } else {
//           query = query.orderBy(`${tableName}.created_at`, 'desc')
//         }
//       }
//     } catch (e) {
//       query = query.orderBy(`${tableName}.created_at`, 'desc')
//     }
  
//     return query
//   }
