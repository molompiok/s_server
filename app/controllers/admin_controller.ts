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
import { CHECK_ROLES } from '#abilities/main';
import RedisService from '#services/RedisService';
import { MAIN_SERVER_CONF_FILENAME, NGINX_SITES_AVAILABLE_PATH_IN_S_SERVER, NGINX_SITES_ENABLED_PATH_IN_S_SERVER } from '#services/routing_service/utils';
// import BullMQ from '#services/RedisService' // Si on veut exposer des contrôles BullMQ
// import { Logs } from '#controllers/Utils/functions'; // Si on veut retourner des logs

const MapDelete: Record<string, { path: string, expire_at: number }> = {};

export default class AdminControlsController {

    // TODO: Ajouter Middleware Admin strict sur toutes les routes de ce contrôleur
    async pingStoreApi({ params, response, bouncer }: HttpContext) {
        const storeId = params.storeId;
        
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
        bouncer.authorize('performAdminActions');
        const user = await auth.authenticate();

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
    async global_status({ response, bouncer }: HttpContext) {

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
     * Redémarre tous les services actifs (stores et thèmes).
     * POST /admin/restart-all-services
     */
    async restart_all_services({ response, bouncer }: HttpContext) {
        const results = { stores: { success: 0, failed: 0 }, themes: { success: 0, failed: 0 } };
        await bouncer.authorize('performAdminActions');
        try {
            console.warn("ADMIN ACTION: Redémarrage de tous les services store actifs...");
            const activeStores = await Store.query().where('is_active', true);
            for (const store of activeStores) {
                const result = await StoreService.restartStoreService(store.id);
                if (result.success) results.stores.success++;
                else { results.stores.failed++;}
            }
            console.warn("ADMIN ACTION: Redémarrage de tous les services thème actifs...");
            const activeThemes = await Theme.query().where('is_active', true);
            for (const theme of activeThemes) {
                const result = await ThemeService.restartThemeService(theme.id);
                if (result.success) results.themes.success++;
                else { results.themes.failed++;}
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
    async refresh_nginx_configs({ response, bouncer }: HttpContext) {

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


    /**
     * Déclenche une vérification des répertoires orphelins (ancien GarbageCollector).
     * POST /admin/garbage-collect/dirs
     */
    async garbage_collect_dirs({ response, bouncer }: HttpContext) {

        await bouncer.authorize('performAdminActions');

        try {
            console.warn("ADMIN ACTION: Vérification des répertoires orphelins...");
            // NOTE: L'ancienne logique inpectAppDirs utilisait execa('rm -rf') DIRECTEMENT.
            // C'est dangereux. Une meilleure approche serait de LISTER les éléments suspects
            // et de laisser l'admin confirmer la suppression via une autre action.

            // Exemple modifié : LISTE seulement ce qui semble suspect
            const stores = await Store.query().select('id');
            //  const themes = await Theme.query().select('id'); // Pas utilisé avant mais logique de l'ajouter
            const storeIds = stores.map(s => s.id);
            //  const themeIds = themes.map(t => t.id); // TODO: Ajouter une gestion des volumes Thème si applicable

            const suspects = {
                nginxAvailable: [] as string[],
                nginxEnabled: [] as string[],
                apiVolumes: [] as string[],
            };

            const checkDir = async (dirPath: string, validIds: string[], ignore: string[], targetArray: string[]) => {
                try {
                    const files = await fs.readdir(dirPath);
                    for (const fileName of files) {
                        // Ignore les fichiers/dossiers spéciaux
                        if (ignore.includes(fileName)) continue;
                        // Vérifie si le nom (sans .conf) correspond à un ID valide
                        const baseName = fileName.replace('.conf', '');
                        if (!validIds.includes(baseName)) {
                            targetArray.push(path.join(dirPath, fileName));
                        }
                    }
                } catch (error: any) { if (error.code !== 'ENOENT') console.error(`Erreur lecture ${dirPath}:`, error); }
            };

            const ignoreNginx = ['default', MAIN_SERVER_CONF_FILENAME + '.conf'];
            const apiVolumeBase = env.get('S_API_VOLUME_SOURCE', '/volumes/api');

            await checkDir(NGINX_SITES_AVAILABLE_PATH_IN_S_SERVER, storeIds, ignoreNginx, suspects.nginxAvailable);
            await checkDir(NGINX_SITES_ENABLED_PATH_IN_S_SERVER, storeIds, ignoreNginx, suspects.nginxEnabled);
            await checkDir(apiVolumeBase, storeIds, [], suspects.apiVolumes);

            return !response ? suspects : response.ok({
                message: "Vérification terminée. Liste des éléments potentiellement orphelins:",
                suspects
                // TODO: Ajouter un endpoint pour CONFIRMER la suppression de ces suspects.
            });

        } catch (error) {
            console.error("Erreur garbage_collect_dirs:", error);
            return !response ? null : response.internalServerError({ message: "Erreur serveur lors de la vérification des répertoires." });
        }
    }
    /**
    * Validateur pour la suppression des répertoires/fichiers orphelins.
    * Accepte une liste de chemins (chaînes).
    */
    static deleteGarbageValidator = vine.compile(
        vine.object({
            paths_to_delete: vine.array(vine.string().trim().minLength(1).optional()) // Doit être un tableau de chaînes non vides
        })
    )

    /**
     * Supprime une liste de fichiers/répertoires spécifiés avec confirmation sécurisée.
     * DELETE /admin/garbage-collect/dirs
     * Body: { "paths_to_delete": ["/path/to/delete1", "/path/to/delete2"], "confirmation_keys": ["key1", "key2"] }
     */
    async delete_garbage_dirs({ request, response, bouncer }: HttpContext) {
        // 1. Validation du Payload

        await bouncer.authorize('performDangerousAdminActions');

        const validator = vine.compile(
            vine.object({
                paths_to_delete: vine.array(vine.string().trim().minLength(1).optional()).optional(),
                confirmation_keys: vine.array(vine.string().trim().optional()).optional().optional(),
            })
        );

        let payload: { paths_to_delete?: (string | undefined)[]; confirmation_keys?: (string | undefined)[] };
        try {
            payload = await request.validateUsing(validator);
        } catch (error) {
            return response.badRequest(error);
        }

        const pathsToDelete = payload.paths_to_delete?.filter((f): f is string => typeof f === 'string') || [];
        const confirmationKeys = payload.confirmation_keys?.filter((f): f is string => typeof f === 'string') || [];

        if (!pathsToDelete.length && !confirmationKeys.length) {
            return response.badRequest({ message: "Au moins un chemin ou une clé de confirmation est requis." });
        }

        const allowedBasePaths = [
            env.get('S_API_VOLUME_SOURCE', '/volumes/api/'),
            NGINX_SITES_AVAILABLE_PATH_IN_S_SERVER,
            NGINX_SITES_ENABLED_PATH_IN_S_SERVER,
        ];

        // Récupérer les chemins suspects depuis garbage_collect_dirs pour comparaison
        let suspectPaths: string[] = [];
        try {
            const suspectResult = (await this.garbage_collect_dirs({ response: null } as any));
            if (suspectResult) {
                suspectPaths = [
                    ...suspectResult.nginxAvailable,
                    ...suspectResult.nginxEnabled,
                    ...suspectResult.apiVolumes,
                ];
            } else {
                throw new Error('garbage_collect_dirs() : null | void')
            }

        } catch (error) {
            console.error("Erreur lors de la récupération des suspects:", error);
        }

        const validatedPaths: string[] = [];
        const pathsNeedingConfirmation: { path: string; key: string, expire_at: number }[] = [];
        const errors: { path: string; error: string }[] = [];
        const deletionResults: { path: string; success: boolean; error?: string }[] = [];

        // 2. Validation et vérification des chemins
        for (const rawPath of pathsToDelete) {
            const cleanPath = path.normalize(rawPath);

            // Vérifier si le chemin est dans une zone autorisée
            if (!allowedBasePaths.some((base) => cleanPath.startsWith(base + path.sep))) {
                errors.push({
                    path: rawPath,
                    error: `Chemin non autorisé car en dehors des zones gérées (${allowedBasePaths.join(', ')})`,
                });
                continue;
            }

            // Éviter de supprimer la base des volumes
            if (
                [env.get('S_API_VOLUME_SOURCE', '/volumes/api/'), NGINX_SITES_AVAILABLE_PATH_IN_S_SERVER, NGINX_SITES_ENABLED_PATH_IN_S_SERVER].some(
                    (base) => cleanPath === base + path.sep
                )
            ) {
                errors.push({ path: rawPath, error: `Suppression du répertoire de base '${cleanPath}' interdite.` });
                continue;
            }

            const fileName = path.basename(cleanPath);
            const isUuid = validate(fileName.replace('.conf', '')); // Vérifie UUID ou UUID.conf
            const isSuspect = suspectPaths.includes(cleanPath);

            // Si c'est un UUID (volume) ou UUID.conf (nginx) ET dans les suspects, pas besoin de confirmation
            if (isUuid && isSuspect) {
                validatedPaths.push(cleanPath);
            } else {
                // Générer une clé de confirmation
                let confirmationKey = v4().split('-')[0];
                // await Redis.setex(`delete_confirm:${confirmationKey}`, 600, cleanPath); // Expire dans 10min
                MapDelete[confirmationKey] = {
                    expire_at: Date.now() + 60 * 1_000,
                    path: cleanPath
                }
                pathsNeedingConfirmation.push({ path: cleanPath, key: confirmationKey, expire_at: MapDelete[confirmationKey].expire_at, });
            }
        }

        // 3. Gestion des clés de confirmation fournies
        const confirmedPaths: string[] = [];
        const expiredKeys: string[] = [];

        for (const key of confirmationKeys) {
            // const storedPath = await Redis.get(`delete_confirm:${key}`);
            const storedPath = MapDelete[key];
            console.log({ storedPath });

            if (storedPath && storedPath.expire_at > Date.now()) {
                confirmedPaths.push(storedPath.path);
                // await Redis.del(`delete_confirm:${key}`); // Supprimer la clé après usage
                delete MapDelete[key];
            } else {
                expiredKeys.push(key);
                delete MapDelete[key]; // TODO fuite memoire
            }
        }

        // Ajouter les chemins confirmés aux chemins validés
        validatedPaths.push(...confirmedPaths);

        console.log({ validatedPaths, confirmedPaths });

        // 4. Exécution de la suppression
        for (const pathToDelete of validatedPaths) {
            try {
                console.warn(`ADMIN ACTION: Suppression demandée pour ${pathToDelete}...`);
                await execa('sudo', ['rm', '-rf', pathToDelete]);
                console.log(`  -> Suppression de ${pathToDelete} réussie.`);
                deletionResults.push({ path: pathToDelete, success: true });
            } catch (error: any) {
                console.error(`  -> Erreur suppression de ${pathToDelete}:`, error);
                deletionResults.push({ path: pathToDelete, success: false, error: error.stderr || error.message });
            }
        }

        // 5. Réponse
        if (errors.length > 0) {
            return response.badRequest({ message: "Certains chemins fournis sont invalides ou dangereux.", errors });
        }

        const responseData = {
            message: pathsNeedingConfirmation.length
                ? "Certains chemins nécessitent une confirmation. Utilisez les clés fournies."
                : "Opération de suppression terminée.",
            deleted: deletionResults.filter((r) => r.success).map((r) => r.path),
            failed: deletionResults.filter((r) => !r.success),
            confirmation_required: pathsNeedingConfirmation,
            expired_keys: expiredKeys,
        };

        return response.ok(responseData);
    }
}

// Fin classe AdminControlsController