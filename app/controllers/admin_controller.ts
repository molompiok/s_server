// app/controllers/http/admin_controls_controller.ts

import type { HttpContext } from '@adonisjs/core/http'
import SwarmService from '#services/SwarmService'
import StoreService from '#services/StoreService'
import ThemeService from '#services/ThemeService'
import fs from "node:fs/promises";
import RoutingService from '#services/routing_service/index'
import Store from '#models/store'
import Theme from '#models/theme'
import env from '#start/env'
import path from 'node:path';
import db from '@adonisjs/lucid/services/db';
import vine from '@vinejs/vine';
import { execa } from 'execa';
import { v4, validate } from 'uuid';
import User from '#models/user';
import { CHECK_ROLES } from '#abilities/roleValidation';
import RedisService from '#services/RedisService';
import { MAIN_SERVER_CONF_FILENAME } from '#services/routing_service/utils';
import logger from '@adonisjs/core/services/logger';
// import BullMQ from '#services/RedisService' // Si on veut exposer des contrôles BullMQ
// import { Logs } from '#controllers/Utils/functions'; // Si on veut retourner des logs


const GARBAGE_DELETE_CONFIRM_KEY_PREFIX = 'admin_delete_confirm:';
const GARBAGE_DELETE_CONFIRM_TTL_SECONDS = 600; // 10 minutes


export default class AdminControlsController {

    // TODO: Ajouter Middleware Admin strict sur toutes les routes de ce contrôleur
    async pingStoreApi({ params, response, bouncer, auth }: HttpContext) {
        const storeId = params.storeId;
        await auth.authenticate()
        try {
            bouncer.authorize('performAdminActions');

            // 1. Vérifier si le store existe (optionnel mais recommandé)
            // const store = await Store.find(storeId);
            // if (!store) {
            //   return response.notFound({ message: `Store ${storeId} not found.` });
            // }

            // 2. Envoyer le message via RedisService
            console.log(`[s_server Admin] Sending 'admin_ping' to store ${storeId}`);
            const success = await RedisService.sendMessageToService(
                storeId,
                'admin_ping', // Nom de l'événement
                { message: 'Hello from s_server!' } // Données optionnelles
            );

            if (success) {
                console.log(`[s_server Admin] Ping message successfully queued for store ${storeId}.`);
                return response.ok({ message: `Ping command sent to store ${storeId}.` });
            } else {
                console.error(`[s_server Admin] Failed to queue ping message for store ${storeId}.`);
                return response.internalServerError({ message: 'Failed to send ping command.' });
            }
        } catch (error) {
            console.error(`[s_server Admin] Failed to queue ping message for store ${storeId}.`);
            return response.internalServerError({ message: 'Failed to send ping command.' });
        }
    }

    public async admin_logout_all_devices({ request, auth, response, bouncer }: HttpContext) {

        const { user_id } = request.qs()
        const user = await auth.authenticate();
        bouncer.authorize('performAdminActions');

        if (!CHECK_ROLES.isManager(user)) return response.unauthorized('user_id is Admin option');

        const tagetUser = await User.find(user_id);
        if (!tagetUser) return response.notFound('user not found');

        const tokens = await User.accessTokens.all(tagetUser);
        for (const token of tokens) {
            await User.accessTokens.delete(tagetUser, token.identifier);
        }

        return response.ok({ message: 'Déconnexion de tous les appareils réussie.' });
    }

    /**
     * Endpoint de diagnostic global (basique).
     * GET /admin/status
     */
    async global_status({ response, bouncer, auth }: HttpContext) {
        await auth.authenticate()
        await bouncer.authorize('performAdminActions');

        let dockerOk = false;
        let swarmInfo = null;
        let storesSummary = { total: 0, active: 0, running: 0 };
        let themesSummary = { total: 0, active: 0, running: 0 };

        try {
            // Vérifier connexion Docker/Swarm
            swarmInfo = await SwarmService.docker.info(); // info() inclut Swarm si activé
            dockerOk = !!swarmInfo;

            // Résumé Stores
            const storeCounts = await Store.query()
                .count('* as total')
                .count(db.raw(`CASE WHEN is_active = true THEN 1 ELSE NULL END`), 'active')
                .count(db.raw(`CASE WHEN is_running = true THEN 1 ELSE NULL END`), 'running')
                .first();
            storesSummary = {
                total: parseInt(storeCounts?.$extras?.total ?? '0'),
                active: parseInt(storeCounts?.$extras?.active ?? '0'),
                running: parseInt(storeCounts?.$extras?.running ?? '0')
            };


            // Résumé Thèmes
            const themeCounts = await Theme.query()
                .count('* as total')
                .count(db.raw(`CASE WHEN is_active = true THEN 1 ELSE NULL END`), 'active')
                .count(db.raw(`CASE WHEN is_running = true THEN 1 ELSE NULL END`), 'running')
                .first();
            themesSummary = {
                total: parseInt(themeCounts?.$extras?.total ?? '0'),
                active: parseInt(themeCounts?.$extras?.active ?? '0'),
                running: parseInt(themeCounts?.$extras?.running ?? '0')
            };


            return response.ok({
                status: 'ok',
                docker_swarm_status: dockerOk ? 'connected' : 'error',
                swarm_node_count: dockerOk ? swarmInfo?.Swarm?.Nodes : null,
                stores: storesSummary,
                themes: themesSummary,
                // TODO: Ajouter état connexion DB, Redis...
            });

        } catch (error) {
            console.error("Erreur Admin Status:", error);
            return response.internalServerError({
                status: 'error',
                message: "Erreur lors de la récupération du statut global.",
                docker_swarm_status: dockerOk ? 'connected' : 'error', // Peut avoir réussi puis échoué après
                stores: storesSummary,
                themes: themesSummary,
                error: error.message,
            });
        }
    }

    /**
     * NB  Swarm va lancer de nouvelles tâches avec la nouvelle image et arrêter les anciennes (rolling update).
     * Redémarre tous les services actifs (stores et thèmes).
     * POST /admin/restart-all-services
     */
    async restart_all_services({ response, bouncer, auth }: HttpContext) {
        const results = { stores: { success: 0, failed: 0 }, themes: { success: 0, failed: 0 } };
        await auth.authenticate()
        await bouncer.authorize('performAdminActions');
        try {
            console.warn("ADMIN ACTION: Redémarrage de tous les services store actifs...");
            const activeStores = await Store.query().where('is_active', true);
            for (const store of activeStores) {
                const result = await StoreService.restartStoreService(store.id);
                if (result.success) results.stores.success++;
                else { results.stores.failed++; }
            }
            console.warn("ADMIN ACTION: Redémarrage de tous les services thème actifs...");
            const activeThemes = await Theme.query().where('is_active', true);
            for (const theme of activeThemes) {
                const result = await ThemeService.restartThemeService(theme.id);
                if (result.success) results.themes.success++;
                else { results.themes.failed++; }
            }

            return response.ok({
                message: "Tentatives de redémarrage terminées.",
                details: results
            });
        } catch (error) {
            console.error("Erreur restart_all_services:", error);
            return response.internalServerError({
                message: "Erreur lors du redémarrage des services.",
                details: results, // Peut montrer succès partiels
                error: error.message
            });
        }
    }

    /**
     * Force la mise à jour de TOUTES les configurations Nginx (serveur + stores).
     * POST /admin/refresh-nginx
     */
    async refresh_nginx_configs({ response, bouncer, auth }: HttpContext) {
        await auth.authenticate()
        await bouncer.authorize('performAdminActions');

        try {
            console.warn("ADMIN ACTION: Rafraîchissement de toutes les configurations Nginx...");
            let success = true;
            const allStores = await Store.all();
            // Mettre à jour chaque config store SANS reload individuel
            for (const store of allStores) {
                success = await RoutingService.updateStoreCustomDomainRouting(store, false) && success;
            }
            // Mettre à jour config serveur ET faire le reload final
            success = await RoutingService.updateMainPlatformRouting(true) && success;

            if (success) {
                return response.ok({ message: "Configurations Nginx rafraîchies et rechargées." });
            } else {
                return response.internalServerError({ message: "Échec lors du rafraîchissement Nginx (voir logs serveur)." });
            }
        } catch (error) {
            console.error("Erreur refresh_nginx_configs:", error);
            return response.internalServerError({ message: "Erreur serveur lors du rafraîchissement Nginx." });
        }
    }

    async garbage_collect_dirs({ response, bouncer, request, auth }: HttpContext) { // Passé response pour consistence
        await auth.authenticate()
        await bouncer.authorize('performAdminActions');
        logger.warn('[AdminControls] ADMIN ACTION: Vérification des répertoires orphelins...');
        try {
            const stores = await Store.query().select('id');
            const storeIds = stores.map(s => s.id);

            const suspects = {
                nginxAvailable: [] as string[],
                nginxEnabled: [] as string[],
                apiVolumes: [] as string[],
            };

            const checkDir = async (dirPathOnHost: string, validDirNames: string[], ignore: string[], targetArray: string[]) => {
                // Cette fonction doit opérer sur les chemins HÔTE, pas les chemins DANS le conteneur s_server
                // car les volumes des stores sont créés sur l'hôte.
                // `dirPathOnHost` est le chemin de base sur l'hôte, ex: /srv/sublymus/volumes/api_store_volumes
                try {
                    const items = await fs.readdir(dirPathOnHost);
                    for (const itemName of items) {
                        if (ignore.includes(itemName)) continue;
                        const baseName = itemName.replace('.conf', ''); // Pour les confs Nginx
                        if (!validDirNames.includes(baseName)) { // Compare le nom du dossier/fichier avec les IDs valides
                            targetArray.push(path.join(dirPathOnHost, itemName)); // Chemin complet sur l'hôte
                        }
                    }
                } catch (error: any) {
                    if (error.code === 'ENOENT') {
                        logger.warn(`[AdminControls] Répertoire ${dirPathOnHost} non trouvé lors du garbage collect.`);
                    } else {
                        logger.error({ err: error, dirPath: dirPathOnHost }, `[AdminControls] Erreur lecture ${dirPathOnHost} pour garbage collect.`);
                    }
                }
            };

            // CHEMINS SUR L'HÔTE LUS DEPUIS L'ENV DE S_SERVER
            // (car s_server est celui qui connaît ces chemins via ses variables d'env mappées aux volumes)
            const nginxSitesAvailableHostPath = env.get('NGINX_SITES_AVAILABLE_ON_HOST');
            const nginxSitesEnabledHostPath = env.get('NGINX_SITES_ENABLED_ON_HOST');
            const apiVolumeBaseHostPath = env.get('S_API_VOLUME_SOURCE_BASE_IN_S_SERVER'); // Ex: /srv/sublymus/volumes/api_store_volumes

            if (!nginxSitesAvailableHostPath || !nginxSitesEnabledHostPath || !apiVolumeBaseHostPath) {
                logger.error("[AdminControls] Chemins Nginx ou API_VOLUME_SOURCE_BASE non configurés dans .env de s_server.");
                return response.internalServerError({ message: "Configuration serveur manquante pour le garbage collection." });
            }

            const ignoreNginx = ['default', path.basename(MAIN_SERVER_CONF_FILENAME)]; // Utiliser basename car MAIN_SERVER_CONF_FILENAME peut avoir un préfixe de chemin

            await checkDir(nginxSitesAvailableHostPath, storeIds, ignoreNginx, suspects.nginxAvailable);
            await checkDir(nginxSitesEnabledHostPath, storeIds, ignoreNginx, suspects.nginxEnabled);
            await checkDir(apiVolumeBaseHostPath, storeIds, [], suspects.apiVolumes); // Ici, les noms de dossier sont les storeId

            const responseContext = request.method() === 'GET' ? response : null; // Pour l'appel interne de delete_garbage_dirs

            if (responseContext) {
                return responseContext.ok({
                    message: "Vérification terminée. Liste des éléments potentiellement orphelins (chemins sur l'hôte) :",
                    suspects
                });
            }
            return suspects; // Pour l'appel interne

        } catch (error) {
            logger.error({ err: error }, "[AdminControls] Erreur garbage_collect_dirs");
            const responseContext = request.method() === 'GET' ? response : null;
            if (responseContext) {
                return responseContext.internalServerError({ message: "Erreur serveur lors de la vérification des répertoires." });
            }
            return null; // Pour l'appel interne
        }
    }

    async delete_garbage_dirs({ request, response, bouncer, auth }: HttpContext) {
        await auth.authenticate()
        await bouncer.authorize('performDangerousAdminActions');
        logger.warn('[AdminControls] ADMIN ACTION: Demande de suppression de répertoires orphelins...');

        const validator = vine.compile(
            vine.object({
                paths_to_delete: vine.array(vine.string().trim().minLength(1)).optional(), // Doit être un tableau de chaînes non vides
                confirmation_keys: vine.array(vine.string().trim().minLength(1)).optional(),
            })
        );

        let payload: { paths_to_delete?: string[]; confirmation_keys?: string[] };
        try {
            payload = await request.validateUsing(validator);
        } catch (error) {
            logger.warn({ err: error.messages }, "[AdminControls] Validation échouée pour delete_garbage_dirs");
            return response.badRequest(error.messages);
        }

        const pathsToDelete = payload.paths_to_delete || [];
        const confirmationKeys = payload.confirmation_keys || [];

        if (pathsToDelete.length === 0 && confirmationKeys.length === 0) {
            return response.badRequest({ message: "Au moins un chemin à supprimer ou une clé de confirmation est requis." });
        }

        // Ces chemins doivent être ceux sur L'HÔTE, car execa('sudo rm') s'exécute sur l'hôte via s_server
        const allowedBasePathsOnHost = [
            env.get('S_API_VOLUME_SOURCE_BASE_IN_S_SERVER'), // Ex: /srv/sublymus/volumes/api_store_volumes
            env.get('NGINX_SITES_AVAILABLE_ON_HOST'),
            env.get('NGINX_SITES_ENABLED_ON_HOST'),
        ].filter(Boolean) as string[]; // Filtrer les undefined et typer en string[]

        if (allowedBasePathsOnHost.length < 3) {
            logger.error("[AdminControls] Configuration des chemins de base autorisés pour la suppression est incomplète.");
            return response.internalServerError({ message: "Erreur de configuration serveur." });
        }

        let suspectPaths: string[] = [];
        try {
            // Simuler un contexte pour l'appel interne
            const fakeHttpContext = { request: { method: () => 'INTERNAL' }, response: null } as unknown as HttpContext;
            const suspectResult = await this.garbage_collect_dirs(fakeHttpContext);
            if (suspectResult && typeof suspectResult !== 'string' && 'nginxAvailable' in suspectResult) { // Vérifier si c'est l'objet suspects
                suspectPaths = [
                    ...suspectResult.nginxAvailable,
                    ...suspectResult.nginxEnabled,
                    ...suspectResult.apiVolumes,
                ];
            } else {
                logger.warn("[AdminControls] N'a pas pu récupérer la liste des suspects pour delete_garbage_dirs.");
            }
        } catch (error) {
            logger.error({ err: error }, "[AdminControls] Erreur lors de la récupération des suspects pour delete_garbage_dirs.");
        }


        const validatedPathsForImmediateDeletion: string[] = [];
        const pathsNeedingConfirmation: { path: string; key: string }[] = [];
        const validationErrors: { path: string; error: string }[] = [];

        for (const rawPath of pathsToDelete) {
            const cleanPathOnHost = path.normalize(rawPath);

            if (!allowedBasePathsOnHost.some(base => cleanPathOnHost.startsWith(base + path.sep) && cleanPathOnHost !== base)) {
                validationErrors.push({ path: rawPath, error: `Chemin non autorisé ou tentative de suppression de la base.` });
                continue;
            }

            const fileName = path.basename(cleanPathOnHost);
            const isStoreRelatedId = validate(fileName.replace('.conf', '')); // Vérifie si c'est un UUID (pour storeId)
            const isSuspect = suspectPaths.includes(cleanPathOnHost);

            if (isStoreRelatedId && isSuspect) {
                validatedPathsForImmediateDeletion.push(cleanPathOnHost);
            } else {
                const confirmationKey = v4().substring(0, 8); // Clé plus courte
                const redisKey = `${GARBAGE_DELETE_CONFIRM_KEY_PREFIX}${confirmationKey}`;
                try {
                    await RedisService.client.set(redisKey, cleanPathOnHost, 'EX', GARBAGE_DELETE_CONFIRM_TTL_SECONDS);
                    pathsNeedingConfirmation.push({ path: cleanPathOnHost, key: confirmationKey });
                } catch (redisError) {
                    logger.error({ err: redisError, path: cleanPathOnHost }, "[AdminControls] Erreur Redis pour clé de confirmation de suppression.");
                    validationErrors.push({ path: rawPath, error: "Erreur interne lors de la préparation de la confirmation." });
                }
            }
        }

        const confirmedPathsFromKeys: string[] = [];
        const expiredOrInvalidKeys: string[] = [];

        for (const key of confirmationKeys) {
            const redisKey = `${GARBAGE_DELETE_CONFIRM_KEY_PREFIX}${key}`;
            const storedPath = await RedisService.client.get(redisKey);
            if (storedPath) {
                // Valider à nouveau le storedPath pour la sécurité, au cas où Redis serait compromis
                if (!allowedBasePathsOnHost.some(base => storedPath.startsWith(base + path.sep) && storedPath !== base)) {
                    logger.error(`[AdminControls] Chemin invalide récupéré de Redis pour la clé ${key}: ${storedPath}`);
                    validationErrors.push({ path: `key:${key}`, error: "Clé de confirmation invalide ou corrompue." });
                    await RedisService.client.del(redisKey); // Supprimer la clé suspecte
                    continue;
                }
                confirmedPathsFromKeys.push(storedPath);
                await RedisService.client.del(redisKey);
            } else {
                expiredOrInvalidKeys.push(key);
            }
        }

        const finalPathsToDelete = [...new Set([...validatedPathsForImmediateDeletion, ...confirmedPathsFromKeys])];
        const deletionResults: { path: string; success: boolean; error?: string }[] = [];

        for (const pathToDelete of finalPathsToDelete) {
            try {
                logger.warn({ pathToDelete }, `[AdminControls] ADMIN ACTION: Suppression effective de ${pathToDelete}...`);
                await execa('sudo', ['rm', '-rf', pathToDelete]); // S'exécute sur l'hôte VPS
                logger.info({ pathToDelete }, `[AdminControls] Suppression de ${pathToDelete} réussie.`);
                deletionResults.push({ path: pathToDelete, success: true });
            } catch (error: any) {
                logger.error({ err: error, pathToDelete }, `[AdminControls] Erreur suppression de ${pathToDelete}`);
                deletionResults.push({ path: pathToDelete, success: false, error: error.stderr || error.message });
            }
        }

        const responseData: any = {
            message: "Opération de nettoyage terminée.",
            deleted_items: deletionResults.filter(r => r.success).map(r => r.path),
            failed_deletions: deletionResults.filter(r => !r.success),
            paths_requiring_confirmation: pathsNeedingConfirmation,
            invalid_or_expired_keys: expiredOrInvalidKeys,
        };
        if (validationErrors.length > 0) {
            responseData.validation_errors = validationErrors;
            responseData.message = "Certains chemins étaient invalides ou des erreurs se sont produites. " + responseData.message;
        }
        if (pathsNeedingConfirmation.length > 0) {
            responseData.message = "Certains chemins nécessitent une confirmation. " + responseData.message;
        }


        return response.ok(responseData);
    }

    // /**
    //  * Déclenche une vérification des répertoires orphelins (ancien GarbageCollector).
    //  * POST /admin/garbage-collect/dirs
    //  */
    // async garbage_collect_dirs({ response, bouncer }: HttpContext) {

    //     await bouncer.authorize('performAdminActions');

    //     try {
    //         console.warn("ADMIN ACTION: Vérification des répertoires orphelins...");
    //         // NOTE: L'ancienne logique inpectAppDirs utilisait execa('rm -rf') DIRECTEMENT.
    //         // C'est dangereux. Une meilleure approche serait de LISTER les éléments suspects
    //         // et de laisser l'admin confirmer la suppression via une autre action.

    //         // Exemple modifié : LISTE seulement ce qui semble suspect
    //         const stores = await Store.query().select('id');
    //         //  const themes = await Theme.query().select('id'); // Pas utilisé avant mais logique de l'ajouter
    //         const storeIds = stores.map(s => s.id);
    //         //  const themeIds = themes.map(t => t.id); // TODO: Ajouter une gestion des volumes Thème si applicable

    //         const suspects = {
    //             nginxAvailable: [] as string[],
    //             nginxEnabled: [] as string[],
    //             apiVolumes: [] as string[],
    //         };

    //         const checkDir = async (dirPath: string, validIds: string[], ignore: string[], targetArray: string[]) => {
    //             try {
    //                 const files = await fs.readdir(dirPath);
    //                 for (const fileName of files) {
    //                     // Ignore les fichiers/dossiers spéciaux
    //                     if (ignore.includes(fileName)) continue;
    //                     // Vérifie si le nom (sans .conf) correspond à un ID valide
    //                     const baseName = fileName.replace('.conf', '');
    //                     if (!validIds.includes(baseName)) {
    //                         targetArray.push(path.join(dirPath, fileName));
    //                     }
    //                 }
    //             } catch (error: any) { if (error.code !== 'ENOENT') console.error(`Erreur lecture ${dirPath}:`, error); }
    //         };

    //         const ignoreNginx = ['default', MAIN_SERVER_CONF_FILENAME + '.conf'];
    //         const apiVolumeBase = env.get('S_API_VOLUME_SOURCE', '/srv/sublymus/volumes/api_store_volumes');

    //         await checkDir(NGINX_SITES_AVAILABLE_PATH_IN_S_SERVER, storeIds, ignoreNginx, suspects.nginxAvailable);
    //         await checkDir(NGINX_SITES_ENABLED_PATH_IN_S_SERVER, storeIds, ignoreNginx, suspects.nginxEnabled);
    //         await checkDir(apiVolumeBase, storeIds, [], suspects.apiVolumes);

    //         return !response ? suspects : response.ok({
    //             message: "Vérification terminée. Liste des éléments potentiellement orphelins:",
    //             suspects
    //             // TODO: Ajouter un endpoint pour CONFIRMER la suppression de ces suspects.
    //         });

    //     } catch (error) {
    //         console.error("Erreur garbage_collect_dirs:", error);
    //         return !response ? null : response.internalServerError({ message: "Erreur serveur lors de la vérification des répertoires." });
    //     }
    // }
    // /**
    // * Validateur pour la suppression des répertoires/fichiers orphelins.
    // * Accepte une liste de chemins (chaînes).
    // */
    // static deleteGarbageValidator = vine.compile(
    //     vine.object({
    //         paths_to_delete: vine.array(vine.string().trim().minLength(1).optional()) // Doit être un tableau de chaînes non vides
    //     })
    // )

    // /**
    //  * Supprime une liste de fichiers/répertoires spécifiés avec confirmation sécurisée.
    //  * DELETE /admin/garbage-collect/dirs
    //  * Body: { "paths_to_delete": ["/path/to/delete1", "/path/to/delete2"], "confirmation_keys": ["key1", "key2"] }
    //  */
    // async delete_garbage_dirs({ request, response, bouncer }: HttpContext) {
    //     // 1. Validation du Payload

    //     await bouncer.authorize('performDangerousAdminActions');

    //     const validator = vine.compile(
    //         vine.object({
    //             paths_to_delete: vine.array(vine.string().trim().minLength(1).optional()).optional(),
    //             confirmation_keys: vine.array(vine.string().trim().optional()).optional().optional(),
    //         })
    //     );

    //     let payload: { paths_to_delete?: (string | undefined)[]; confirmation_keys?: (string | undefined)[] };
    //     try {
    //         payload = await request.validateUsing(validator);
    //     } catch (error) {
    //         return response.badRequest(error);
    //     }

    //     const pathsToDelete = payload.paths_to_delete?.filter((f): f is string => typeof f === 'string') || [];
    //     const confirmationKeys = payload.confirmation_keys?.filter((f): f is string => typeof f === 'string') || [];

    //     if (!pathsToDelete.length && !confirmationKeys.length) {
    //         return response.badRequest({ message: "Au moins un chemin ou une clé de confirmation est requis." });
    //     }

    //     const allowedBasePaths = [
    //         env.get('S_API_VOLUME_SOURCE', '/srv/sublymus/volumes/api_store_volumes'),
    //         NGINX_SITES_AVAILABLE_PATH_IN_S_SERVER,
    //         NGINX_SITES_ENABLED_PATH_IN_S_SERVER,
    //     ];

    //     // Récupérer les chemins suspects depuis garbage_collect_dirs pour comparaison
    //     let suspectPaths: string[] = [];
    //     try {
    //         const suspectResult = (await this.garbage_collect_dirs({ response: null } as any));
    //         if (suspectResult) {
    //             suspectPaths = [
    //                 ...suspectResult.nginxAvailable,
    //                 ...suspectResult.nginxEnabled,
    //                 ...suspectResult.apiVolumes,
    //             ];
    //         } else {
    //             throw new Error('garbage_collect_dirs() : null | void')
    //         }

    //     } catch (error) {
    //         console.error("Erreur lors de la récupération des suspects:", error);
    //     }

    //     const validatedPaths: string[] = [];
    //     const pathsNeedingConfirmation: { path: string; key: string, expire_at: number }[] = [];
    //     const errors: { path: string; error: string }[] = [];
    //     const deletionResults: { path: string; success: boolean; error?: string }[] = [];

    //     // 2. Validation et vérification des chemins
    //     for (const rawPath of pathsToDelete) {
    //         const cleanPath = path.normalize(rawPath);

    //         // Vérifier si le chemin est dans une zone autorisée
    //         if (!allowedBasePaths.some((base) => cleanPath.startsWith(base + path.sep))) {
    //             errors.push({
    //                 path: rawPath,
    //                 error: `Chemin non autorisé car en dehors des zones gérées (${allowedBasePaths.join(', ')})`,
    //             });
    //             continue;
    //         }

    //         // Éviter de supprimer la base des volumes
    //         if (
    //             [env.get('S_API_VOLUME_SOURCE', '/srv/sublymus/volumes/api_store_volumes'), NGINX_SITES_AVAILABLE_PATH_IN_S_SERVER, NGINX_SITES_ENABLED_PATH_IN_S_SERVER].some(
    //                 (base) => cleanPath === base + path.sep
    //             )
    //         ) {
    //             errors.push({ path: rawPath, error: `Suppression du répertoire de base '${cleanPath}' interdite.` });
    //             continue;
    //         }

    //         const fileName = path.basename(cleanPath);
    //         const isUuid = validate(fileName.replace('.conf', '')); // Vérifie UUID ou UUID.conf
    //         const isSuspect = suspectPaths.includes(cleanPath);

    //         // Si c'est un UUID (volume) ou UUID.conf (nginx) ET dans les suspects, pas besoin de confirmation
    //         if (isUuid && isSuspect) {
    //             validatedPaths.push(cleanPath);
    //         } else {
    //             // Générer une clé de confirmation
    //             let confirmationKey = v4().split('-')[0];
    //             // await Redis.setex(`delete_confirm:${confirmationKey}`, 600, cleanPath); // Expire dans 10min
    //             MapDelete[confirmationKey] = {
    //                 expire_at: Date.now() + 60 * 1_000,
    //                 path: cleanPath
    //             }
    //             pathsNeedingConfirmation.push({ path: cleanPath, key: confirmationKey, expire_at: MapDelete[confirmationKey].expire_at, });
    //         }
    //     }

    //     // 3. Gestion des clés de confirmation fournies
    //     const confirmedPaths: string[] = [];
    //     const expiredKeys: string[] = [];

    //     for (const key of confirmationKeys) {
    //         // const storedPath = await Redis.get(`delete_confirm:${key}`);
    //         const storedPath = MapDelete[key];
    //         console.log({ storedPath });

    //         if (storedPath && storedPath.expire_at > Date.now()) {
    //             confirmedPaths.push(storedPath.path);
    //             // await Redis.del(`delete_confirm:${key}`); // Supprimer la clé après usage
    //             delete MapDelete[key];
    //         } else {
    //             expiredKeys.push(key);
    //             delete MapDelete[key]; // TODO fuite memoire
    //         }
    //     }

    //     // Ajouter les chemins confirmés aux chemins validés
    //     validatedPaths.push(...confirmedPaths);

    //     console.log({ validatedPaths, confirmedPaths });

    //     // 4. Exécution de la suppression
    //     for (const pathToDelete of validatedPaths) {
    //         try {
    //             console.warn(`ADMIN ACTION: Suppression demandée pour ${pathToDelete}...`);
    //             await execa('sudo', ['rm', '-rf', pathToDelete]);
    //             console.log(`  -> Suppression de ${pathToDelete} réussie.`);
    //             deletionResults.push({ path: pathToDelete, success: true });
    //         } catch (error: any) {
    //             console.error(`  -> Erreur suppression de ${pathToDelete}:`, error);
    //             deletionResults.push({ path: pathToDelete, success: false, error: error.stderr || error.message });
    //         }
    //     }

    //     // 5. Réponse
    //     if (errors.length > 0) {
    //         return response.badRequest({ message: "Certains chemins fournis sont invalides ou dangereux.", errors });
    //     }

    //     const responseData = {
    //         message: pathsNeedingConfirmation.length
    //             ? "Certains chemins nécessitent une confirmation. Utilisez les clés fournies."
    //             : "Opération de suppression terminée.",
    //         deleted: deletionResults.filter((r) => r.success).map((r) => r.path),
    //         failed: deletionResults.filter((r) => !r.success),
    //         confirmation_required: pathsNeedingConfirmation,
    //         expired_keys: expiredKeys,
    //     };

    //     return response.ok(responseData);
    // }
    /**
     * Récupère le solde du portefeuille principal de la plateforme.
     * GET /admin/platform-wallet
     */
    async getPlatformWallet({ response, bouncer, auth }: HttpContext) {
        await auth.authenticate();
        await bouncer.authorize('performAdminActions');

        const platformWalletId = env.get('WAVE_PLATFORM_WALLET_ID');
        if (!platformWalletId) {
            return response.internalServerError({ message: 'WAVE_PLATFORM_WALLET_ID non configuré.' });
        }

        try {
            const waveService = (await import('#services/payments/wave')).default;
            const balance = await waveService.getWalletBalance(platformWalletId);
            return response.ok(balance);
        } catch (error) {
            logger.error({ error: error.message }, 'Failed to fetch platform wallet balance');
            return response.internalServerError({ message: 'Erreur lors de la récupération du solde plateforme.' });
        }
    }

    /**
     * Récupère le solde de n'importe quel portefeuille (Admin seulement).
     * GET /admin/wallets/:id
     */
    async getWalletBalance({ params, response, bouncer, auth }: HttpContext) {
        await auth.authenticate();
        await bouncer.authorize('performAdminActions');

        const walletId = params.id;
        if (!walletId) {
            return response.badRequest({ message: 'ID du portefeuille requis.' });
        }

        try {
            const waveService = (await import('#services/payments/wave')).default;
            const balance = await waveService.getWalletBalance(walletId);
            return response.ok(balance);
        } catch (error) {
            logger.error({ walletId, error: error.message }, 'Failed to fetch wallet balance');
            return response.internalServerError({ message: 'Erreur lors de la récupération du solde.' });
        }
    }

    async getAffiliations({ response, bouncer, auth }: HttpContext) {
        await auth.authenticate();
        await bouncer.authorize('performAdminActions');

        const AffiliateCode = (await import('#models/affiliate_code')).default;
        const affiliations = await AffiliateCode.query()
            .preload('owner')
            .orderBy('created_at', 'desc');

        return response.ok(affiliations);
    }

    /**
     * Récupère les transactions d'un portefeuille (Admin seulement).
     * GET /admin/wallets/:id/transactions
     */
    async getWalletTransactions({ params, request, response, bouncer, auth }: HttpContext) {
        await auth.authenticate();
        await bouncer.authorize('performAdminActions');

        const walletId = params.id;
        if (!walletId) {
            return response.badRequest({ message: 'ID du portefeuille requis.' });
        }

        const { start_date, end_date, category, limit, offset } = request.qs();

        try {
            const waveService = (await import('#services/payments/wave')).default;
            const transactions = await waveService.getWalletTransactions(walletId, {
                start_date,
                end_date,
                category,
                limit: limit ? parseInt(limit) : undefined,
                offset: offset ? parseInt(offset) : undefined,
            });
            return response.ok(transactions);
        } catch (error) {
            logger.error({ walletId, error: error.message }, 'Failed to fetch wallet transactions');
            return response.internalServerError({ message: 'Erreur lors de la récupération des transactions.' });
        }
    }
}

// Fin classe AdminControlsController