// app/services/ThemeService.ts

import Theme from '#models/theme'
import Store from '#models/store'
import { Logs } from '../controllers2/Utils/functions.js' // TODO: Déplacer
import SwarmService from '#services/SwarmService'
import RoutingService from '#services/RoutingService'
import StoreService from '#services/StoreService' // Import pour la déléguation
import env from '#start/env'
import Dockerode from 'dockerode'

interface ThemeServiceResult {
    success: boolean;
    theme?: Theme | null;
    logs: Logs;
}


class ThemeService {

    /**
     * Crée/Met à jour un thème en BDD et lance/met à jour son service Swarm associé.
     * Rend la fonction idempotente: si le thème existe, lance/MAJ le service.
     */
    async createOrUpdateAndRunTheme(themeData: { /* ... (comme avant) */
        id: string; name: string; description?: string | null; docker_image_name: string;
        docker_image_tag: string; internal_port: number; source_path?: string | null;
        is_public?: boolean; is_active?: boolean; // Ajouter is_active ici
    }): Promise<ThemeServiceResult> {
        const logs = new Logs(`ThemeService.createOrUpdateAndRunTheme (${themeData.id})`);
        const themeId = themeData.id;
        const serviceName = `theme_${themeId}`;
        let theme = await Theme.find(themeId);
        let isNew = false;

        // --- 1. Créer ou Merger le thème en BDD ---
        try {
            if (theme) {
                logs.log(`ℹ️ Thème ${themeId} existant, mise à jour BDD...`);
                theme.merge({ // Applique les nouvelles données sauf ID
                    name: themeData.name, 
                    description: themeData.description ?? null,
                    docker_image_name: themeData.docker_image_name, 
                    docker_image_tag: themeData.docker_image_tag,
                    internal_port: themeData.internal_port,
                    source_path: themeData.source_path ?? null,
                    is_public: themeData.is_public ?? theme.is_public, // Garde ancien si non fourni
                    is_active: themeData.is_active ?? theme.is_active, // Garde ancien si non fourni
                    // is_running est géré par le lancement Swarm
                    // is_default ne doit pas être modifié ici facilement
                });
            } else {
                logs.log(`✨ Création nouveau Thème ${themeId} en BDD...`);
                isNew = true;
                const default_theme = await Theme.findDefault(); // Convention pour le thème par défaut
                 const isDefault = themeId ===  default_theme?.id
                 if(isDefault) {
                     if(default_theme && default_theme.id !== themeId) {
                         logs.logErrors("❌ Un autre thème est déjà marqué par défaut. Corriger manuellement.");
                         return { success: false, theme:null, logs };
                     }
                 }
                theme = await Theme.create({
                    id: themeId, name: themeData.name, 
                    description: themeData.description,
                    docker_image_name: themeData.docker_image_name, 
                    docker_image_tag: themeData.docker_image_tag,
                    internal_port: themeData.internal_port, 
                    source_path: themeData.source_path,
                    is_public: themeData.is_public ?? true,
                    is_active: themeData.is_active ?? true, // Actif par défaut?
                    is_running: false, // Pas encore lancé
                    is_default: isDefault
                });
            }
            await theme.save(); // Sauvegarde après merge ou create
            logs.log(`✅ Thème ${themeId} ${isNew ? 'créé' : 'mis à jour'} en BDD.`);

        } catch (error) {
            logs.notifyErrors(`❌ Erreur ${isNew ? 'création' : 'MàJ'} Thème BDD`, { themeId }, error);
            return { success: false, theme: null, logs };
        }

        // --- 2. Lancer ou Mettre à Jour le Service Swarm ---
        let swarmOk = false;
        let finalRunningState = false;
        try {
             logs.log(`🚀 Lancement/MàJ Service Swarm Thème '${serviceName}'...`);
             // Vérifier si le thème doit être actif pour être lancé
             if (!theme.is_active) {
                  logs.log(`ℹ️ Thème ${themeId} marqué inactif (is_active=false), suppression/arrêt du service Swarm...`);
                  // Si le service tourne, l'arrêter (scale 0), sinon le supprimer
                  await SwarmService.removeService(serviceName); // remove gère le cas inexistant
                  finalRunningState = false; // Doit être non-running
                  swarmOk = true; // L'opération demandée (ne pas le lancer) est un succès
             } else {
                  // Construire la spec (comme avant)
                  const envVars = { /* ... (défini comme avant) ... */
                      THEME_ID: theme.id, THEME_NAME: theme.name, HOST: '0.0.0.0',
                      PORT: theme.internal_port.toString(), NODE_ENV: env.get('NODE_ENV','development'),
                      REDIS_HOST: env.get('REDIS_HOST'), REDIS_PORT: env.get('REDIS_PORT'),
                      REDIS_PASSWORD: env.get('REDIS_PASSWORD')
                  };
                  const themeSpec = SwarmService.constructThemeServiceSpec(
                      theme.id, theme.fullImageName, 1, theme.internal_port,
                      envVars, [{Target:'sublymus_net'}]
                  );
                  const swarmService = await SwarmService.createOrUpdateService(serviceName, themeSpec);
                  swarmOk = !!swarmService;
                  finalRunningState = swarmOk; // Si l'update/create réussit, il devrait être running (1 replica)
             }

             // MAJ finale BDD pour is_running
             if (theme.is_running !== finalRunningState) {
                  theme.is_running = finalRunningState;
                  await theme.save();
                  logs.log(`📊 is_running Thème MàJ -> ${finalRunningState}`);
             }

             // MAJ Nginx SI le port interne a changé lors d'un update
              const currentServiceInfo = await SwarmService.inspectService(serviceName);
              const currentPort = parseInt(
                currentServiceInfo?.Spec?.TaskTemplate?.ContainerSpec?.Env?.find((e:any)=>e.startsWith("PORT="))?.split("=")[1] ?? '0');

             if(theme.is_active && currentServiceInfo && theme.internal_port !== currentPort ) {
                  logs.log(`⚠️ Port interne thème changé -> MAJ Nginx requise`);
                  const serverOk = await RoutingService.updateServerRouting(false);
                  const storesUsingTheme = await Store.query().where('current_theme_id', themeId);
                  let allStoresOk = true;
                  for(const store of storesUsingTheme) {
                      allStoresOk = await RoutingService.updateStoreRouting(store, false) && allStoresOk;
                  }
                  if(serverOk && allStoresOk) await RoutingService.reloadNginx(); // Reload à la fin
                  else logs.logErrors("❌ Échec MAJ Nginx partielle ou totale après changement port thème.");
             }

            if (!swarmOk && theme.is_active) { // Si on voulait le lancer mais ça a échoué
                 throw new Error("Échec création/MAJ service Swarm thème.");
            }
             logs.log(`✅ Opération Swarm terminée (état final running: ${finalRunningState}).`);

        } catch (error) {
             logs.notifyErrors(`❌ Erreur opération Service Swarm Thème`, { themeId }, error);
             // Rollback BDD complexe si c'était un update.
             // Si c'était une création, on pourrait supprimer le thème.
             if (isNew && theme && !theme.$isDeleted) await theme.delete();
             return { success: false, theme: null, logs };
        }

        return { success: true, theme, logs };
    }

    /**
     * Supprime un thème (appel délégué).
     * Gère la logique de fallback vers thème API ('') si force=true.
     */
    async deleteThemeAndCleanup(themeId: string, force: boolean = false): Promise<ThemeServiceResult> {
         const logs = new Logs(`ThemeService.deleteThemeAndCleanup (${themeId})`);
         const theme = await Theme.find(themeId);
         if (!theme) return { success: true, theme: null, logs: logs.log('ℹ️ Thème déjà supprimé.') };

         if (theme.is_default) return { success: false, theme, logs: logs.logErrors('❌ Suppression thème par défaut interdite.') };

         const serviceName = `theme_${themeId}`;
         let storesUpdateOk = true;

        // Traitement des stores affectés SI force=true
        if (force) {
             const storesToUpdate = await Store.query().where('current_theme_id', themeId);
             if (storesToUpdate.length > 0) {
                  logs.log(`⚠️ Forçage: Fallback vers API pour ${storesToUpdate.length} store(s)...`);
                  const updatePromises = storesToUpdate.map(async (store) => {
                      // Délègue à StoreService qui gère BDD+Cache+Nginx du store
                       const result = await StoreService.changeStoreTheme(store.id, null); // null -> utilise API
                       if (!result) { logs.logErrors(`   -> ⚠️ Échec fallback pour store ${store.id}`); storesUpdateOk = false; }
                       else { logs.log(`   -> Store ${store.id} passé au thème API.`) }
                  });
                  await Promise.all(updatePromises);
             }
        } else {
            // Vérification simple si non forcé
             const count = await Store.query().where('current_theme_id', themeId).count('* as total');
             if (count[0].$extras.total > 0) {
                 logs.logErrors(`❌ Thème utilisé par ${count[0].$extras.total} store(s). Use force=true.`);
                 return { success: false, theme, logs };
             }
        }
         if (!storesUpdateOk && force) {
            logs.logErrors("❌ Échec de la mise à jour d'au moins un store lors du fallback. Suppression annulée.");
             return {success: false, theme, logs};
         }

        // --- Procéder à la suppression du thème ---
        let swarmRemoved = false;
        let themeDeleted = false;
         try {
              logs.log(`🗑️ Suppression Service Swarm '${serviceName}'...`);
              swarmRemoved = await SwarmService.removeService(serviceName);

              logs.log('🗑️ Suppression Thème de la BDD...');
              await theme.delete();
              themeDeleted = true;

              logs.log('🏁 Suppression thème terminée.');
               // Nginx est mis à jour par les appels à StoreService.changeStoreTheme si force=true

               return { success: swarmRemoved && themeDeleted, theme: null, logs };

         } catch(error) {
              logs.notifyErrors('❌ Erreur durant suppression thème/swarm', {}, error);
              return { success: false, theme: null, logs };
         }
     }

     /** Arrête le service Swarm d'un thème (scale à 0 et MAJ is_running). */
     async stopThemeService(themeId: string): Promise<ThemeServiceResult> {
         const logs = new Logs(`ThemeService.stopThemeService (${themeId})`);
         const theme = await Theme.find(themeId);
         if (!theme) return { success: false, theme: null, logs: logs.logErrors(`❌ Thème non trouvé.`) };

         const serviceName = `theme_${themeId}`;
         logs.log(`📉 Arrêt Swarm Thème '${serviceName}'...`);
         const scaled = await SwarmService.scaleService(serviceName, 0);
         const newRunningState = scaled ? false : theme.is_running;

         if (scaled) {
             logs.log(`✅ Service mis à 0 répliques.`);
              if(theme.is_running !== newRunningState) {
                   theme.is_running = newRunningState;
                   try { await theme.save(); logs.log(`📊 is_running Thème MàJ -> false`); }
                   catch(e) { logs.notifyErrors('❌ Erreur save après stop Swarm',{},e); }
              }
         } else { logs.logErrors(`❌ Échec scale down Swarm.`); }
         return { success: scaled, theme, logs };
     }

     /** Démarre le service Swarm d'un thème (scale à 1 et MAJ is_running). */
    async startThemeService(themeId: string, replicas: number = 1): Promise<ThemeServiceResult> {
        const logs = new Logs(`ThemeService.startThemeService (${themeId} -> ${replicas})`);
         const theme = await Theme.find(themeId);
        if (!theme) return { success: false, theme: null, logs: logs.logErrors(`❌ Thème ${themeId} non trouvé.`) };
        if (!theme.is_active) return {success: false, theme, logs: logs.logErrors(`❌ Thème ${themeId} inactif (is_active=false), démarrage non autorisé.`)};
         if (replicas <= 0) return {success: false, theme, logs: logs.logErrors('❌ Répliques > 0 requis.')}
         // Si déjà running ? On pourrait juste retourner true.
         if (theme.is_running && replicas === 1) return {success: true, theme, logs: logs.log("ℹ️ Thème déjà running (1 replica).")}

         const serviceName = `theme_${themeId}`;
         logs.log(`📈 Démarrage Swarm Thème '${serviceName}' -> ${replicas}...`);
         const scaled = await SwarmService.scaleService(serviceName, replicas);
         const newRunningState = scaled ? true : theme.is_running;

         if (scaled) {
              logs.log(`✅ Service mis à ${replicas} répliques.`);
              if(theme.is_running !== newRunningState) {
                   theme.is_running = newRunningState;
                   try { await theme.save(); logs.log(`📊 is_running Thème MàJ -> true`); }
                   catch(e) { logs.notifyErrors('❌ Erreur save après start Swarm',{},e); }
              }
         } else { logs.logErrors(`❌ Échec scale up Swarm.`); }
         return { success: scaled, theme, logs };
     }

    /** Redémarre les tâches du service Swarm d'un thème. */
    async restartThemeService(themeId: string): Promise<ThemeServiceResult> {
         const logs = new Logs(`ThemeService.restartThemeService (${themeId})`);
         const theme = await Theme.find(themeId);
         if (!theme) return { success: false, theme: null, logs: logs.logErrors(`❌ Thème ${themeId} non trouvé.`) };

         const serviceName = `theme_${themeId}`;
          // Si on le redémarre, il doit être running ensuite
         const expectedRunningState = true;
         try {
             // (Logique restart via forceUpdate comme avant)
             const service = SwarmService.docker.getService(serviceName);
             const serviceInfo = await service.inspect(); const version = serviceInfo.Version.Index;
             await service.update({ version, Name: serviceInfo.Spec.Name, TaskTemplate: serviceInfo.Spec.TaskTemplate,
                 EndpointSpec: serviceInfo.Spec.EndpointSpec, Labels: serviceInfo.Spec.Labels, Mode: serviceInfo.Spec.Mode,
                 UpdateConfig: serviceInfo.Spec.UpdateConfig, RollbackConfig: serviceInfo.Spec.RollbackConfig,
                 TaskTemplateForceUpdate: (serviceInfo.Spec.TaskTemplate?.ForceUpdate || 0) + 1 });
             logs.log('✅ Redémarrage service Swarm demandé.');

              // S'assure que is_running est true
              if(theme.is_running !== expectedRunningState) {
                  theme.is_running = expectedRunningState;
                  await theme.save();
                  logs.log("📊 is_running thème forcé à true après restart.")
              }
             return { success: true, theme, logs };
         } catch (error:any) { /* (gestion 404 et autres erreurs) */
              if(error.statusCode === 404) logs.logErrors(`❌ Service ${serviceName} non trouvé.`);
              else logs.notifyErrors(`❌ Erreur demande redémarrage Swarm`, {}, error);
              return { success: false, theme, logs };
         }
    }

    /** Met à jour un thème (rolling update image tag). */
     async updateThemeVersion(themeId: string, newImageTag: string): Promise<ThemeServiceResult> {
         const logs = new Logs(`ThemeService.updateThemeVersion (${themeId} -> ${newImageTag})`);
         const theme = await Theme.find(themeId);
         if (!theme) return { success: false, theme: null, logs: logs.logErrors(`❌ Thème non trouvé.`) };
         if (!theme.is_active) return { success: false, theme, logs: logs.logErrors("❌ Thème inactif, MàJ version non autorisée.")};

         const serviceName = `theme_${themeId}`;
         try {
               // (Logique Swarm update spec + service.update comme avant)
               logs.log(`🔄 Préparation MàJ Swarm '${serviceName}' -> tag ${newImageTag}...`);
                const currentServiceInfo = await SwarmService.inspectService(serviceName);
               if (!currentServiceInfo) throw new Error("Service Swarm non trouvé.");
               const currentSpec = currentServiceInfo.Spec; const version = currentServiceInfo.Version.Index;
                const newTaskSpec: Dockerode.TaskSpec = {
                    ...currentSpec?.TaskTemplate, ContainerSpec: { ...(currentSpec?.TaskTemplate?.ContainerSpec),
                        Image: `${theme.docker_image_name}:${newImageTag}` }};
                await SwarmService.docker.getService(serviceName).update({ version, Name: currentSpec?.Name, Labels: currentSpec?.Labels,
                    Mode: currentSpec?.Mode, UpdateConfig: currentSpec?.UpdateConfig, RollbackConfig: currentSpec?.RollbackConfig,
                    EndpointSpec: currentSpec?.EndpointSpec, TaskTemplate: newTaskSpec });
               logs.log(`✅ Mise à jour Swarm demandée.`);

               // MAJ BDD
                theme.docker_image_tag = newImageTag;
                // S'assure is_running = true
                if(!theme.is_running) theme.is_running = true;
                await theme.save();
                logs.log(`✅ Tag image & is_running MàJ BDD: ${newImageTag}.`);

               return { success: true, theme, logs };

          } catch(error) {
               logs.notifyErrors(`❌ Erreur MàJ version thème`, { themeId, newImageTag }, error);
                // Si Swarm a échoué mais la BDD était OK avant, on ne touche pas la BDD? Ou on remet is_running?
                return { success: false, theme, logs };
          }
     }

     /** Active ou désactive un thème globalement. */
    async setThemeActiveStatus(themeId: string, isActive: boolean): Promise<ThemeServiceResult> {
        const logs = new Logs(`ThemeService.setThemeActiveStatus (${themeId} -> ${isActive})`);
        const theme = await Theme.find(themeId);
        if (!theme) return { success: false, theme: null, logs: logs.logErrors(`❌ Thème ${themeId} non trouvé.`) };

         if (theme.is_default && !isActive) return { success: false, theme, logs: logs.logErrors("❌ Désactivation thème par défaut interdite.") };

         if(theme.is_active === isActive) return { success: true, theme, logs: logs.log("ℹ️ Thème déjà dans cet état actif.")};

         theme.is_active = isActive;
         try {
             await theme.save();
              logs.log(`✅ Statut is_active Thème ${themeId} mis à jour: ${isActive}.`);

             // Si on désactive, il faut aussi arrêter le service Swarm associé !
             if (!isActive) {
                  logs.log("   -> Thème désactivé, arrêt du service Swarm...");
                  await this.stopThemeService(themeId); // Appelle la méthode qui gère scale 0 + is_running
             } else {
                 // Si on active, faut-il démarrer le service? Pas forcément, il démarrera peut-être
                 // seulement si un store l'utilise ou si l'admin le fait explicitement. Laissons
                 // startThemeService pour un démarrage explicite.
             }
             return { success: true, theme, logs };
         } catch (error) {
              logs.notifyErrors(`❌ Erreur sauvegarde/arrêt lors de changement is_active`, {}, error);
              return { success: false, theme, logs };
         }
    }
}

export default new ThemeService();