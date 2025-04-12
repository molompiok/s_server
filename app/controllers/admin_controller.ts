// app/controllers/http/admin_controls_controller.ts

import type { HttpContext } from '@adonisjs/core/http'
import SwarmService from '#services/SwarmService'
import StoreService from '#services/StoreService' 
import ThemeService from '#services/ThemeService' 
import fs from "node:fs/promises";
import RoutingService, { NGINX_SITES_AVAILABLE, NGINX_SITES_ENABLED, SERVER_CONF_NAME } from '#services/RoutingService'
import Store from '#models/store'
import Theme from '#models/theme'
import env from '#start/env'
import path from 'node:path';
// import BullMQ from '#services/RedisService' // Si on veut exposer des contrôles BullMQ
// import { Logs } from '#controllers/Utils/functions'; // Si on veut retourner des logs

export default class AdminControlsController {

  // TODO: Ajouter Middleware Admin strict sur toutes les routes de ce contrôleur

  /**
   * Endpoint de diagnostic global (basique).
   * GET /admin/status
   */
  async global_status({ response }: HttpContext) {
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
            .count('case when is_active = true then 1 else null end as active')
            .count('case when is_running = true then 1 else null end as running')
            .first();
        storesSummary = {
            total: parseInt(storeCounts?.$extras?.total ?? '0'),
            active: parseInt(storeCounts?.$extras?.active ?? '0'),
            running: parseInt(storeCounts?.$extras?.running ?? '0')
        };


       // Résumé Thèmes
       const themeCounts = await Theme.query()
           .count('* as total')
            .count('case when is_active = true then 1 else null end as active')
            .count('case when is_running = true then 1 else null end as running')
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
   async restart_all_services({ response }: HttpContext) {
        const results = { stores: { success: 0, failed: 0 }, themes: { success: 0, failed: 0 }};
        let overallSuccess = true;

        try {
            console.warn("ADMIN ACTION: Redémarrage de tous les services store actifs...");
             const activeStores = await Store.query().where('is_active', true);
             for (const store of activeStores) {
                 const result = await StoreService.restartStoreService(store.id);
                 if (result.success) results.stores.success++;
                 else { results.stores.failed++; overallSuccess = false; }
             }
             console.warn("ADMIN ACTION: Redémarrage de tous les services thème actifs...");
             const activeThemes = await Theme.query().where('is_active', true);
              for (const theme of activeThemes) {
                  const result = await ThemeService.restartThemeService(theme.id);
                  if (result.success) results.themes.success++;
                  else { results.themes.failed++; overallSuccess = false; }
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
  async refresh_nginx_configs({ response }: HttpContext) {
       try {
            console.warn("ADMIN ACTION: Rafraîchissement de toutes les configurations Nginx...");
           let success = true;
            const allStores = await Store.all();
           // Mettre à jour chaque config store SANS reload individuel
           for(const store of allStores) {
               success = await RoutingService.updateStoreRouting(store, false) && success;
           }
           // Mettre à jour config serveur ET faire le reload final
           success = await RoutingService.updateServerRouting(true) && success;

           if(success) {
               return response.ok({ message: "Configurations Nginx rafraîchies et rechargées."});
           } else {
                return response.internalServerError({ message: "Échec lors du rafraîchissement Nginx (voir logs serveur)."});
           }
       } catch (error) {
            console.error("Erreur refresh_nginx_configs:", error);
            return response.internalServerError({ message: "Erreur serveur lors du rafraîchissement Nginx."});
       }
  }


   /**
    * Déclenche une vérification des répertoires orphelins (ancien GarbageCollector).
    * POST /admin/garbage-collect/dirs
    */
    async garbage_collect_dirs({ response }: HttpContext) {
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
                     for(const fileName of files) {
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

             const ignoreNginx = ['default', SERVER_CONF_NAME + '.conf'];
              const apiVolumeBase = env.get('S_API_VOLUME_SOURCE', '/volumes/api');

             await checkDir(NGINX_SITES_AVAILABLE, storeIds, ignoreNginx, suspects.nginxAvailable);
              await checkDir(NGINX_SITES_ENABLED, storeIds, ignoreNginx, suspects.nginxEnabled);
              await checkDir(apiVolumeBase, storeIds, [], suspects.apiVolumes);

             return response.ok({
                 message: "Vérification terminée. Liste des éléments potentiellement orphelins:",
                 suspects
                 // TODO: Ajouter un endpoint pour CONFIRMER la suppression de ces suspects.
             });

        } catch (error) {
             console.error("Erreur garbage_collect_dirs:", error);
             return response.internalServerError({ message: "Erreur serveur lors de la vérification des répertoires."});
        }
    }


} // Fin classe AdminControlsController