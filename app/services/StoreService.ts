// app/services/StoreService.ts

import Store from '#models/store'
import Api from '#models/api' 
import Theme from '#models/theme' 
import { Logs } from '../controllers2/Utils/functions.js' 
import { serviceNameSpace } from '../controllers2/Utils/functions.js' 
import SwarmService, { ServiceUpdateOptions } from '#services/SwarmService'
import ProvisioningService from '#services/ProvisioningService'
import RoutingService from '#services/RoutingService'
import RedisService from '#services/RedisService'
import env from '#start/env'
import { v4 as uuidv4 } from 'uuid'
import { DateTime } from 'luxon'
import Dockerode from 'dockerode'

// Interface pour le résultat
interface RunStoreResult {
    success: boolean;
    store: Store | null; // Peut être null en cas d'échec précoce
    logs: Logs;
}

interface SimpleResult {
    success: boolean;
    logs: Logs;
}

interface UpdateStoreResult {
    success: boolean;
    store: Store | null;
    logs: Logs;
}

class StoreService {

    /**
     * Crée un nouveau store et lance son infrastructure (DB, User, Volume, API Service Swarm).
     */
    async createAndRunStore(storeData: {
        name: string;
        title: string;
        description?: string;
        userId: string;
        domaines?: string[];
        logo?: string;
        coverImage?: string;
    }): Promise<RunStoreResult> {
        const logs = new Logs('StoreService.createAndRunStore');
        const storeId = uuidv4(); // Génère UUID ici (ou utilise le hook du modèle)
        const nameSpaces = serviceNameSpace(storeId);

        let store: Store | null = null;
        let defaultApi: Api | null = null;
        let apiServiceName = '';

        // --- Vérification Préalable : API par défaut ---
        try {
            defaultApi = await Api.findDefault();
            if (!defaultApi) throw new Error('Aucune API par défaut trouvée.');
            logs.log(`👍 API par défaut: ${defaultApi.name} (${defaultApi.id})`);
        } catch (error) {
            logs.notifyErrors('❌ Erreur recherche API par défaut.', {}, error);
            return { success: false, store: null, logs };
        }

        // --- Vérification Préalable : Nom de store unique ---
        try {
             const nameExists = await Store.findBy('name', storeData.name);
             if (nameExists) {
                 logs.logErrors(`❌ Nom de store '${storeData.name}' déjà utilisé.`);
                 return { success: false, store: null, logs};
             }
        } catch(error) {
             logs.notifyErrors('❌ Erreur vérification unicité nom.', {}, error);
             return { success: false, store: null, logs};
        }


        // --- Étapes avec potentiel Rollback ---
        try {
            // --- 1. Création du Store en BDD ---
            const expire_at = DateTime.now().plus({ days: 14 });
            const disk_storage_limit_gb = 1;
            const initialDomaines = storeData.domaines ?? [];

            store = await Store.create({
                id: storeId, // Fournir l'ID généré
                user_id: storeData.userId,
                name: storeData.name,
                title: storeData.title,
                description: storeData.description || '',
                domaines: initialDomaines, // Directement le tableau grâce à prepare/consume
                current_theme_id: null, // Thème défini plus tard
                current_api_id: defaultApi.id,
                expire_at: expire_at,
                disk_storage_limit_gb: disk_storage_limit_gb,
                is_active: false, // Activé à la fin
                is_running: false, // Démarré plus bas
                logo: [], // Vide par défaut
                cover_image: [], // Vide par défaut
            });
            logs.log(`✅ Store créé en BDD: ${store.id}`);
             // TODO: Gérer upload logo/coverImage ici si ce sont des fichiers et pas des URLs


            // --- 2. Provisioning (DB, User, Volume) ---
             logs.log('⚙️ Démarrage du provisioning...');
             const provisionOk = await ProvisioningService.provisionStoreInfrastructure(store);
             if (!provisionOk) throw new Error('Échec du provisioning infrastructure.');
             logs.log('✅ Provisioning terminé.');

            // --- 3. Lancement du Service Swarm API ---
             logs.log('🚀 Lancement du service Swarm API...');
            apiServiceName = `api_store_${store.id}`;

            const envVars = { /* ... (défini comme avant, utiliser defaultApi.internal_port) ... */
                STORE_ID: store.id,
                USER_ID: store.user_id,
                DB_HOST: env.get('DB_HOST'),
                DB_PORT: env.get('DB_PORT'),
                DB_USER: nameSpaces.USER_NAME,
                DB_PASSWORD: nameSpaces.DB_PASSWORD,
                DB_DATABASE: nameSpaces.DB_DATABASE,
                REDIS_HOST: env.get('REDIS_HOST'),
                REDIS_PORT: env.get('REDIS_PORT'),
                REDIS_PASSWORD: env.get('REDIS_PASSWORD'),
                APP_KEY: uuidv4(),
                HOST: '0.0.0.0',
                PORT: defaultApi.internal_port.toString(),
                NODE_ENV: env.get('NODE_ENV', 'development'),
                LOG_LEVEL: env.get('LOG_LEVEL', 'info'),
            };
            const apiSpec = SwarmService.constructApiServiceSpec({
                storeId: store.id,
                imageName: defaultApi.fullImageName,
                replicas: 1,
                internalPort:  defaultApi.internal_port,
                envVars: envVars,
                volumeSource: nameSpaces.VOLUME_SOURCE,
                volumeTarget: env.get('S_API_VOLUME_TARGET', '/volumes'),
                userNameOrId: nameSpaces.USER_NAME,
                networks: [{Target:'sublymus_net'}],
                resources:'basic',
            });
            const apiService = await SwarmService.createOrUpdateService(apiServiceName, apiSpec);
            if (!apiService) throw new Error("Échec création service Swarm API.");

            // Mise à jour état BDD après succès Swarm
            store.is_running = true;
            await store.save();
            logs.log(`✅ Service Swarm lancé, store marqué is_running=true.`);
             // Initialiser canal communication
             await RedisService.ensureCommunicationChannel(store.id);

            // --- 4. Mise à jour Cache Redis & Routage Nginx ---
             logs.log('💾🌐 Mise à jour Cache & Nginx...');
            await RedisService.setStoreCache(store); // Cache avec is_running=true

            const serverRouteOk = await RoutingService.updateServerRouting(true); // Met à jour /store.name et reload
             if (!serverRouteOk) throw new Error("Échec Nginx.");
            logs.log('✅ Cache et Routage Nginx mis à jour.');

            // --- 5. Activer le store (is_active) ---
             logs.log('✨ Activation finale du store...');
             store.is_active = true;
            await store.save();
             await RedisService.setStoreCache(store); // MAJ finale cache
            logs.log('✅ Store marqué comme is_active.');

            // --- FIN : Succès ---
            logs.log('🎉 Store créé et lancé avec succès.');
            return { success: true, store, logs };

        } catch (error: any) {
            logs.notifyErrors(`❌ ERREUR FATALE lors de createAndRunStore`, { storeId: store?.id }, error);
            // --- Tentative de Rollback Complet ---
             logs.log('💀 Tentative de rollback complet...');
            if (store && !store.$isDeleted) { // Si le store a été créé en BDD
                if (apiServiceName) {
                    await SwarmService.removeService(apiServiceName); // Supprime service Swarm si lancé
                }
                await ProvisioningService.deprovisionStoreInfrastructure(store); // Supprime DB, User, Volume
                await RedisService.deleteStoreCache(store); // Nettoie cache
                 await RedisService.closeCommunicationChannel(store.id); // Ferme canal MQ
                await RoutingService.removeStoreRoutingById(store.id, false); // Nettoie conf Nginx domaine custom
                await RoutingService.updateServerRouting(true); // Met à jour server.conf Nginx et reload
                await store.delete(); // Supprime le store de la BDD
                 logs.log('✅ Rollback terminé (best effort).');
            } else {
                logs.log('ℹ️ Pas de rollback nécessaire (échec avant création BDD).');
            }
            return { success: false, store: null, logs }; // Retourne null car rollback
        }
    }

    /**
     * Supprime un store et nettoie son infrastructure.
     */
    async deleteStoreAndCleanup(storeId: string): Promise<SimpleResult> {
        const logs = new Logs(`StoreService.deleteStoreAndCleanup (${storeId})`);
        const store = await Store.find(storeId);
        if (!store) return { success: true, logs: logs.log('ℹ️ Store déjà supprimé.') };

        let overallSuccess = true;
        const apiServiceName = `api_store_${storeId}`;

        try {
            logs.log(`1. Suppression Service Swarm API '${apiServiceName}'...`);
             overallSuccess = await SwarmService.removeService(apiServiceName) && overallSuccess;
             // On continue même si échec Swarm

            logs.log('2. Nettoyage Routage Nginx & Cache Redis...');
            await RoutingService.removeStoreRoutingById(storeId, false);
             await RoutingService.updateServerRouting(true); // MAJ finale Nginx et reload
             await RedisService.deleteStoreCache(store);
             await RedisService.closeCommunicationChannel(storeId);

             logs.log('3. Déprovisioning (DB, User, Volume)...');
             overallSuccess = await ProvisioningService.deprovisionStoreInfrastructure(store) && overallSuccess;

            logs.log('4. Suppression Store de la BDD...');
            await store.delete();

            logs.log('5. TODO: Nettoyer fichiers store si nécessaire');

             logs.log('🏁 Processus de suppression terminé.');
             return { success: overallSuccess, logs }; // Retourne le succès global (best effort)

        } catch (error) {
            logs.notifyErrors('❌ Erreur inattendue pendant deleteStoreAndCleanup', { storeId }, error);
             // Difficile de savoir où ça a échoué, le succès global sera probablement false
             return { success: false, logs };
        }
    }

    /**
     * Met à jour les informations de base d'un store.
     */
    async updateStoreInfo(storeId: string, updateData: { /* ... (voir implémentation précédente) */
        name?: string; title?: string; description?: string;
        logo?: string; coverImage?: string;
    }): Promise<UpdateStoreResult> {
         const logs = new Logs(`StoreService.updateStoreInfo (${storeId})`);
         // --- Vérifications initiales ---
         const store = await Store.find(storeId);
         if (!store) return { success: false, store: null, logs: logs.logErrors(`❌ Store non trouvé.` ) };

        const previousName = store.name;
        const allowedUpdates: Partial<Store> = {};
         let nameChanged = false;

        if (updateData.name !== undefined && updateData.name !== store.name) {
            const nameExists = await Store.query().where('id', '!=', storeId).where('name', updateData.name).first();
            if (nameExists) return { success: false, store: null, logs: logs.logErrors(`❌ Nom '${updateData.name}' déjà utilisé.`) };
            allowedUpdates.name = updateData.name;
             nameChanged = true;
        }
        if (updateData.title !== undefined) allowedUpdates.title = updateData.title;
        if (updateData.description !== undefined) allowedUpdates.description = updateData.description;
        if (updateData.logo !== undefined) allowedUpdates.logo = []; // TODO: Gérer JSON Parse/Update logo[]
        if (updateData.coverImage !== undefined) allowedUpdates.cover_image = []; // TODO: Gérer JSON Parse/Update cover_image[]

        if (Object.keys(allowedUpdates).length === 0) {
            return { success: true, store, logs: logs.log("ℹ️ Aucune modification fournie.") };
        }

        // --- Application & Sauvegarde ---
        try {
            store.merge(allowedUpdates);
            await store.save();
             logs.log(`✅ Store ${storeId} MàJ BDD.`);
             // MAJ Cache (gère l'ancien nom)
             await RedisService.setStoreCache(store, nameChanged ? previousName : undefined);

            // MAJ Nginx si le nom a changé
            if (nameChanged) {
                logs.log(`🏷️ Nom changé -> MàJ Nginx Server Conf...`);
                await RoutingService.updateServerRouting(true);
            }
            return { success: true, store, logs };
        } catch (error) {
             logs.notifyErrors(`❌ Erreur sauvegarde/cache/nginx pour ${storeId}`, {}, error);
             return { success: false, store: null, logs };
        }
    }

     /**
      * Met à l'échelle le nombre de répliques du service API Swarm pour un store.
      */
     async scaleStoreService(storeId: string, replicas: number): Promise<SimpleResult> {
         const logs = new Logs(`StoreService.scaleStoreService (${storeId} -> ${replicas} replicas)`);
         if (replicas < 0) return { success: false, logs: logs.logErrors('❌ Répliques >= 0 requis.') };

         const store = await Store.find(storeId);
         if (!store) return { success: false, logs: logs.logErrors(`❌ Store ${storeId} non trouvé.`) };

        const apiServiceName = `api_store_${storeId}`;
        logs.log(`⚖️ Scaling Swarm API '${apiServiceName}' -> ${replicas}...`);
         const scaled = await SwarmService.scaleService(apiServiceName, replicas);

        const newRunningState = scaled ? (replicas > 0) : store.is_running;

         if (scaled) {
              logs.log(`✅ Scaling Swarm OK.`);
              if (store.is_running !== newRunningState) {
                   store.is_running = newRunningState;
                   try { await store.save(); await RedisService.setStoreCache(store); logs.log(`📊 is_running MàJ -> ${newRunningState}`); }
                   catch(e) { logs.notifyErrors('❌ Erreur save/cache après scaling',{},e); /* Continuer mais état incohérent */ }
              }
         } else {
             logs.logErrors(`❌ Échec scaling Swarm.`);
         }
         return { success: scaled, logs };
     }

    /** Arrête le service API du store (scale 0). */
    async stopStoreService(storeId: string): Promise<SimpleResult> {
        // Utilise is_active pour voir s'il faut VRAIMENT l'arrêter
        const store = await Store.find(storeId);
        if (!store) return {success: true, logs: new Logs().log("Store non trouvé, rien à arrêter.")};
        if (!store.is_active) return {success: true, logs: new Logs().log("Store déjà inactif (is_active=false), arrêt non nécessaire.")}
        // S'il est actif mais is_running est false -> déjà arrêté? Ou problème? Tenter qd même.
        return this.scaleStoreService(storeId, 0);
    }

    /** Démarre le service API du store (scale 1). */
    async startStoreService(storeId: string): Promise<SimpleResult> {
         const store = await Store.find(storeId);
        if (!store) return {success: false, logs: new Logs().logErrors("Store non trouvé, impossible de démarrer.")};
        if (!store.is_active) return {success: false, logs: new Logs().logErrors("Store inactif (is_active=false), démarrage non autorisé.")}
        // S'il est is_running=true déjà? On pourrait juste retourner success=true.
        if (store.is_running) return {success: true, logs: new Logs().log("Service déjà marqué comme running.")}
        // Lance ou scale à 1
        return this.scaleStoreService(storeId, 1);
    }

    /** Redémarre le service API via Swarm forceUpdate. */
    async restartStoreService(storeId: string): Promise<SimpleResult> {
         const logs = new Logs(`StoreService.restartStoreService (${storeId})`);
         // (Même implémentation que précédemment avec forceUpdate via SwarmService)
          const apiServiceName = `api_store_${storeId}`;
         try {
              const service = SwarmService.docker.getService(apiServiceName);
              const serviceInfo = await service.inspect(); // Vérifie existence
              const version = serviceInfo.Version.Index;

             await service.update({
                 version, Name: serviceInfo.Spec.Name, TaskTemplate: serviceInfo.Spec.TaskTemplate,
                 EndpointSpec: serviceInfo.Spec.EndpointSpec, Labels: serviceInfo.Spec.Labels,
                 Mode: serviceInfo.Spec.Mode, UpdateConfig: serviceInfo.Spec.UpdateConfig,
                 RollbackConfig: serviceInfo.Spec.RollbackConfig,
                 TaskTemplateForceUpdate: (serviceInfo.Spec.TaskTemplate?.ForceUpdate || 0) + 1,
             });
             logs.log('✅ Redémarrage service Swarm demandé.');
              // Si on redémarre, on s'assure qu'il est marqué comme running
              const store = await Store.find(storeId);
              if (store && !store.is_running) {
                  store.is_running = true;
                  await store.save();
                  await RedisService.setStoreCache(store);
                  logs.log("📊 Forçage is_running=true après restart.")
              }
             return { success: true, logs };
         } catch (error:any) { /* (gestion 404 et autres erreurs comme avant) */
              if(error.statusCode === 404) logs.logErrors(`❌ Service ${apiServiceName} non trouvé.`);
              else logs.notifyErrors(`❌ Erreur demande redémarrage Swarm`, {}, error);
              return { success: false, logs };
         }
    }

    /** Change le thème actif pour un store. */
    async changeStoreTheme(storeId: string, themeId: string | null): Promise<UpdateStoreResult> {
         const logs = new Logs(`StoreService.changeStoreTheme (${storeId} -> ${themeId || 'API'})`);
         const store = await Store.find(storeId);
         if (!store) return { success: false, store: null, logs: logs.logErrors(`❌ Store non trouvé.` ) };

        const newThemeId = themeId || null; // Utiliser null pour 'pas de thème'

         if (store.current_theme_id === newThemeId) return { success: true, store, logs: logs.log("ℹ️ Thème déjà assigné.") };

        // Vérif thème existe (si non null)
        if (newThemeId) {
             const theme = await Theme.find(newThemeId);
             if (!theme || !theme.is_active) return { success: false, store: null, logs: logs.logErrors(`❌ Thème ${newThemeId} inexistant ou inactif.`) };
        }

         // --- Sauvegarde & MAJ Nginx ---
         try {
             store.current_theme_id = newThemeId;
             await store.save();
              logs.log(`✅ Thème courant store MàJ BDD: ${newThemeId ?? 'API'}.`);
              await RedisService.setStoreCache(store);

              // MAJ Routage Nginx (server.conf ET domaine custom)
              logs.log('🌐 MàJ Nginx après changement thème...');
              const serverOk = await RoutingService.updateServerRouting(false); // false=pas de reload ici
              const storeOk = await RoutingService.updateStoreRouting(store, true); // true=reload final
              if(!serverOk || !storeOk) throw new Error("Échec MàJ Nginx");

              return { success: true, store, logs };
         } catch (error) {
              logs.notifyErrors('❌ Erreur lors du changement de thème', {}, error);
              // Rollback BDD thème? Compliqué. Mieux vaut loguer l'incohérence.
              return { success: false, store: null, logs };
         }
     }

     /** Ajoute un domaine custom à un store. */
     async addStoreDomain(storeId: string, domain: string): Promise<UpdateStoreResult> {
          const logs = new Logs(`StoreService.addStoreDomain (${storeId}, ${domain})`);
          const store = await Store.find(storeId);
          if (!store) return { success: false, store: null, logs: logs.logErrors(`❌ Store ${storeId} non trouvé.`) };

          // Vérification simple format domaine (basique)
          if (!/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(domain)) {
               return {success: false, store, logs: logs.logErrors(`❌ Format de domaine invalide: ${domain}`)};
          }
          // TODO: Vérifier unicité globale du domaine?

          const domaines = store.domaines; // Accède via le `consume`
          if (domaines.includes(domain)) return { success: true, store, logs: logs.log(`ℹ️ Domaine ${domain} déjà présent.`) };

          domaines.push(domain);
          store.domaines = domaines; // Réassigne au champ pour que `prepare` s'applique

          try {
               await store.save();
               await RedisService.setStoreCache(store);
                logs.log(`✅ Domaine ${domain} ajouté en BDD/Cache.`);

               // MAJ Nginx domaine custom
               const nginxOk = await RoutingService.updateStoreRouting(store, true); // true -> reload
                if(!nginxOk) throw new Error("Echec MAJ Nginx domaine custom.");

               return { success: true, store, logs };
          } catch (error) {
               logs.notifyErrors(`❌ Erreur ajout domaine ${domain}`, {}, error);
               // Rollback BDD? Pas simple.
               return { success: false, store: null, logs };
          }
     }

     /** Supprime un domaine custom d'un store. */
    async removeStoreDomain(storeId: string, domainToRemove: string): Promise<UpdateStoreResult> {
         const logs = new Logs(`StoreService.removeStoreDomain (${storeId}, ${domainToRemove})`);
         const store = await Store.find(storeId);
         if (!store) return { success: false, store: null, logs: logs.logErrors(`❌ Store ${storeId} non trouvé.`) };

        let domaines = store.domaines;
        const initialLength = domaines.length;
        domaines = domaines.filter(d => d !== domainToRemove);

         if (domaines.length === initialLength) return { success: true, store, logs: logs.log(`ℹ️ Domaine ${domainToRemove} non trouvé.`) };

        store.domaines = domaines;

        try {
            await store.save();
            await RedisService.setStoreCache(store);
             logs.log(`✅ Domaine ${domainToRemove} supprimé BDD/Cache.`);

            // MAJ Nginx (supprimera le fichier si domaines devient vide)
             const nginxOk = await RoutingService.updateStoreRouting(store, true);
             if(!nginxOk) throw new Error("Echec MAJ Nginx domaine custom.");

            return { success: true, store, logs };
        } catch (error) {
            logs.notifyErrors(`❌ Erreur suppression domaine ${domainToRemove}`, {}, error);
            return { success: false, store: null, logs };
        }
     }

     /** Met à jour la version de l'API utilisée par un store (rolling update). */
    async updateStoreApiVersion(storeId: string, newApiId: string): Promise<UpdateStoreResult> {
        const logs = new Logs(`StoreService.updateStoreApiVersion (${storeId} -> api: ${newApiId})`);
        // --- Vérifications ---
         const store = await Store.find(storeId);
        if (!store) return { success: false, store: null, logs: logs.logErrors(`❌ Store non trouvé.`) };
         if (store.current_api_id === newApiId) return { success: true, store, logs: logs.log("ℹ️ Store utilise déjà cette API.") };

        const newApi = await Api.find(newApiId);
        if (!newApi) return { success: false, store: null, logs: logs.logErrors(`❌ Nouvelle API ${newApiId} non trouvée.`) };

        const apiServiceName = `api_store_${storeId}`;

        // --- Préparation et Update Swarm ---
        try {
             logs.log(`🔄 Préparation MàJ Swarm '${apiServiceName}' -> image ${newApi.fullImageName}...`);
             const currentServiceInfo = await SwarmService.inspectService(apiServiceName);
            if (!currentServiceInfo) throw new Error("Service Swarm actuel non trouvé.");
            const currentSpec = currentServiceInfo.Spec;
            const version = currentServiceInfo.Version.Index;

            const nameSpaces = serviceNameSpace(storeId);
             // Construire newEnvVars en préservant max + MAJ PORT, APP_KEY etc (comme avant)
             const newEnvVarsMap = new Map<string, string>();
             currentSpec?.TaskTemplate?.ContainerSpec?.Env?.forEach((e:any) => { const [k,...v]=e.split('='); if(k) newEnvVarsMap.set(k,v.join('='))});
             newEnvVarsMap.set('PORT', newApi.internal_port.toString());
             newEnvVarsMap.set('APP_KEY', newEnvVarsMap.get('APP_KEY') || uuidv4());
            const newEnvVars = Array.from(newEnvVarsMap.entries()).map(([k, v]) => `${k}=${v}`);

            const newTaskSpec: Dockerode.TaskSpec = { /* ... (comme avant) */
                ...currentSpec?.TaskTemplate,
                 ContainerSpec: {
                    ...(currentSpec?.TaskTemplate?.ContainerSpec),
                     Image: newApi.fullImageName,
                     Env: newEnvVars,
                     User: currentSpec?.TaskTemplate?.ContainerSpec?.User ?? nameSpaces.USER_NAME,
                     Mounts: currentSpec?.TaskTemplate?.ContainerSpec?.Mounts ?? [
                         { Type: 'bind', Source: nameSpaces.VOLUME_SOURCE, Target: env.get('S_API_VOLUME_TARGET', '/volumes') }
                      ]
                 },
            };
            const updateOptions: ServiceUpdateOptions = { /* ... (comme avant) */
                version, Name: currentSpec?.Name, Labels: currentSpec?.Labels, Mode: currentSpec?.Mode,
                 UpdateConfig: currentSpec?.UpdateConfig, RollbackConfig: currentSpec?.RollbackConfig,
                 EndpointSpec: currentSpec?.EndpointSpec, TaskTemplate: newTaskSpec
            };

             logs.log(`🚀 Application rolling update Swarm...`);
             await SwarmService.docker.getService(apiServiceName).update(updateOptions);
             logs.log(`✅ Mise à jour Swarm demandée.`);

             // --- Sauvegarde BDD & Cache ---
              store.current_api_id = newApiId;
              // Assurer que is_running est true après une MAJ de version
              if(!store.is_running) store.is_running = true;
              await store.save();
              await RedisService.setStoreCache(store);
               logs.log(`✅ Référence API & is_running MàJ BDD/Cache: ${newApiId}.`);

             // --- MAJ Nginx si le port interne a changé ---
             // Simplification : on MAJ Nginx si on ne peut pas récupérer l'ancien port facilement
             // L'idéal serait de stocker l'ancien port temporairement ou de le lire de la spec
              logs.log(`🔄 Vérification/MàJ Nginx pour potentiel changement port API...`);
              const serverOk = await RoutingService.updateServerRouting(false);
              const storeOk = await RoutingService.updateStoreRouting(store, true);
              if(!serverOk || !storeOk) throw new Error("Echec MàJ Nginx après MAJ API.");

              return { success: true, store, logs };

        } catch (error) {
              logs.notifyErrors(`❌ Erreur MàJ version API`, { storeId, newApiId }, error);
              // Rollback difficile ici car le rolling update Swarm peut être en cours.
              return { success: false, store: null, logs };
        }
    }

}

export default new StoreService();