// app/services/ThemeService.ts

import Theme from '#models/theme'
import Store from '#models/store'
import { isProd, Logs } from '../Utils/functions.js' // TODO: Déplacer
import SwarmService, { defaultNetworks, ServiceUpdateOptions } from '#services/SwarmService'
import RoutingService from '#services/routing_service/index'
import StoreService from '#services/StoreService' // Import pour la déléguation
import env from '#start/env'
import Dockerode from 'dockerode'
import db from '@adonisjs/lucid/services/db'

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
        is_public?: boolean; is_active?: boolean;
        is_premium?: boolean,
        price?: number,
        is_default?: boolean
        preview_images?: string[]
    },
        createPreviewImages: (theme_id: string) => Promise<string[]>,
        updatePreviewImages: (theme: Theme) => Promise<string[]>,
        justeRun?: boolean
    ): Promise<ThemeServiceResult> {
        const logs = new Logs(`ThemeService.createOrUpdateAndRunTheme (${themeData.id})`);
        const theme_id = themeData.id;
        const serviceName = `theme_${theme_id}`;
        let theme = await Theme.find(theme_id);
        let isNew = false;

        // --- 1. Créer ou Merger le thème en BDD ---
        try {
            console.log('preview_images', themeData.preview_images);

            if (theme && !justeRun) {
                let preview_images: string[] | undefined;
                if (themeData.preview_images) {
                    console.log('preview_images => update');

                    preview_images = await updatePreviewImages(theme)
                }
                theme.merge({ // Applique les nouvelles données sauf ID
                    name: themeData.name ?? theme.name,
                    description: themeData.description ?? theme.description,
                    docker_image_name: themeData.docker_image_name ?? theme.docker_image_name,
                    docker_image_tag: themeData.docker_image_tag ?? theme.docker_image_tag,
                    internal_port: themeData.internal_port ?? theme.internal_port,
                    source_path: themeData.source_path ?? theme.source_path,
                    is_public: themeData.is_public ?? theme.is_public, // Garde ancien si non fourni
                    is_active: themeData.is_active ?? theme.is_active, // Garde ancien si non fourni
                    preview_images: preview_images ?? theme.preview_images,
                    price: themeData.price ?? theme.price,
                    is_premium: themeData.is_premium ?? theme.is_premium
                });
            } else if (!justeRun){
                const preview_images = await createPreviewImages(theme_id)
                logs.log(`ℹ️ Thème ${theme_id} existant, mise à jour BDD...`);

                logs.log(`✨ Création nouveau Thème ${theme_id} en BDD...`);
                isNew = true;
                const default_theme = await Theme.findDefault(); // Convention pour le thème par défaut

                themeData.is_default = !default_theme

                theme = await Theme.create({
                    id: theme_id,
                    name: themeData.name,
                    description: themeData.description,
                    docker_image_name: themeData.docker_image_name,
                    docker_image_tag: themeData.docker_image_tag,
                    internal_port: themeData.internal_port,
                    source_path: themeData.source_path,
                    is_public: themeData.is_public ?? true,
                    is_active: themeData.is_active ?? true,
                    is_running: false,
                    preview_images,
                    is_default: themeData.is_default,
                    price: themeData.price,
                    is_premium: themeData.is_premium
                });
            }
            if(!theme) return { success: false, theme: null, logs }
            
            await theme.save();
            logs.log(`✅ Thème ${theme_id} ${isNew ? 'créé' : 'mis à jour'} en BDD.`);

        } catch (error) {
            logs.notifyErrors(`❌ Erreur ${isNew ? 'création' : 'MàJ'} Thème BDD`, { theme_id }, error);
            return { success: false, theme: null, logs };
        }

        // --- 2. Lancer ou Mettre à Jour le Service Swarm ---
        let swarmOk = false;
        let finalRunningState = false;
        try {
            // En développement, on ne crée pas de conteneur, seulement l'enregistrement en BDD
            if (!isProd) {
                logs.log(`ℹ️ Mode développement: pas de création de conteneur Swarm pour le thème '${serviceName}'`);
                finalRunningState = false; // Pas de conteneur en dev
                swarmOk = true; // Considéré comme succès car on ne veut pas de conteneur
            } else {
                logs.log(`🚀 Lancement/MàJ Service Swarm Thème '${serviceName}'...`);
                // Vérifier si le thème doit être actif pour être lancé
                if (!theme.is_active) {
                    logs.log(`ℹ️ Thème ${theme_id} marqué inactif (is_active=false), suppression/arrêt du service Swarm...`);
                    // Si le service tourne, l'arrêter (scale 0), sinon le supprimer
                    await SwarmService.removeService(serviceName); // remove gère le cas inexistant
                    finalRunningState = false; // Doit être non-running
                    swarmOk = true; // L'opération demandée (ne pas le lancer) est un succès
                } else {
                    // Construire la spec (comme avant)
                    const envVars = { /* ... (défini comme avant) ... */
                        THEME_ID: theme.id,
                        THEME_NAME: theme.name,
                        HOST: '0.0.0.0',
                        PORT: theme.internal_port?.toString(),
                        NODE_ENV: env.get('NODE_ENV', 'development'),
                        REDIS_HOST: env.get('REDIS_HOST'),
                        REDIS_PORT: env.get('REDIS_PORT').toString(),
                        REDIS_PASSWORD: env.get('REDIS_PASSWORD')
                    };
                    const themeSpec = SwarmService.constructThemeServiceSpec({
                        themeId: theme.id,
                        imageName: theme.fullImageName,
                        replicas: 1,
                        envVars,
                        internalPort: theme.internal_port,
                        resources: 'high'
                    }
                    );
                    const swarmService = await SwarmService.createOrUpdateService(serviceName, themeSpec);
                    swarmOk = !!swarmService;
                    finalRunningState = swarmOk; //TODO Si l'update/create réussit, il devrait être running (1 replica)
                }
            }

            // MAJ finale BDD pour is_running
            if (theme.is_running !== finalRunningState) {
                theme.is_running = finalRunningState;
                await theme.save();
                logs.log(`📊 is_running Thème MàJ -> ${finalRunningState}`);
            }

            // MAJ Nginx SI le port interne a changé lors d'un update (seulement en production)
            if (isProd) {
                const currentServiceInfo = await SwarmService.inspectService(serviceName);
                const currentPort = parseInt(
                    currentServiceInfo?.Spec?.TaskTemplate?.ContainerSpec?.Env?.find((e: any) => e.startsWith("PORT="))?.split("=")[1] ?? '0');

                if (theme.is_active && currentServiceInfo && theme.internal_port !== currentPort) {
                    logs.log(`⚠️ Port interne thème changé -> MAJ Nginx requise`);
                    const serverOk = await RoutingService.updateMainPlatformRouting(false);
                    const storesUsingTheme = await Store.query().where('current_theme_id', theme_id);
                    let allStoresOk = true;
                    for (const store of storesUsingTheme) {
                        allStoresOk = await RoutingService.updateStoreCustomDomainRouting(store, false) && allStoresOk;
                    }
                    if (serverOk && allStoresOk) await RoutingService.triggerNginxReload(); // Reload à la fin
                    else logs.logErrors("❌ Échec MAJ Nginx partielle ou totale après changement port thème.");
                }
            }

            if (!swarmOk && theme.is_active && isProd) { // Si on voulait le lancer mais ça a échoué (seulement en prod)
                throw new Error("Échec création/MAJ service Swarm thème.");
            }
            logs.log(`✅ Opération ${isProd ? 'Swarm' : 'BDD'} terminée (état final running: ${finalRunningState}).`);

        } catch (error) {
            logs.notifyErrors(`❌ Erreur opération Service Swarm Thème`, { theme_id }, error);
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
    async deleteThemeAndCleanup(themeId: string | Theme, force: boolean = false): Promise<ThemeServiceResult> {
        const logs = new Logs(`ThemeService.deleteThemeAndCleanup (${themeId})`);
        const theme = typeof themeId == 'string' ? await Theme.find(themeId) : themeId;
        if (!theme) return { success: true, theme: null, logs: logs.log('ℹ️ Thème déjà supprimé.') };

        if (theme.is_default) return { success: false, theme, logs: logs.logErrors('❌ Suppression thème par défaut interdite.') };

        const serviceName = `theme_${theme.id}`;
        let storesUpdateOk = true;

        // Traitement des stores affectés SI force=true
        if (force) {
            const storesToUpdate = await Store.query().where('current_theme_id', theme.id);
            if (storesToUpdate.length > 0) {
                logs.log(`⚠️ Forçage: Fallback vers API pour ${storesToUpdate.length} store(s)...`);
                const updatePromises = storesToUpdate.map(async (store) => {
                    // Délègue à StoreService qui gère BDD+Cache+Nginx du store
                    const result = await StoreService.changeStoreTheme(store.id, null); //TODO  null -> utilise API ou mettre le theme par defaut
                    if (!result) { logs.logErrors(`   -> ⚠️ Échec fallback pour store ${store.id}`); storesUpdateOk = false; }
                    else { logs.log(`   -> Store ${store.id} passé au thème API.`) }
                });
                await Promise.all(updatePromises);
            }
        } else {
            // Vérification simple si non forcé
            const count = await Store.query().where('current_theme_id', theme.id).count('* as total');
            if (count[0].$extras.total > 0) {
                logs.logErrors(`❌ Thème utilisé par ${count[0].$extras.total} store(s). Use force=true.`);
                return { success: false, theme, logs };
            }
        }
        if (!storesUpdateOk && force) {
            logs.logErrors("❌ Échec de la mise à jour d'au moins un store lors du fallback. Suppression annulée.");
            return { success: false, theme, logs };
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

            return { success: swarmRemoved && themeDeleted, theme, logs };

        } catch (error) {
            logs.notifyErrors('❌ Erreur durant suppression thème/swarm', {}, error);
            return { success: false, theme: null, logs };
        }
    }

    /** Arrête le service Swarm d'un thème (scale à 0 et MAJ is_running). */
    async stopThemeService(themeId: string | Theme): Promise<ThemeServiceResult> {
        const logs = new Logs(`ThemeService.stopThemeService (${themeId})`);
        const theme = typeof themeId == 'string' ? await Theme.find(themeId) : themeId;
        if (!theme) return { success: false, theme: null, logs: logs.logErrors(`❌ Thème non trouvé.`) };

        const serviceName = `theme_${theme.id}`;
        logs.log(`📉 Arrêt Swarm Thème '${serviceName}'...`);
        const scaled = await SwarmService.scaleService(serviceName, 0);
        const newRunningState = scaled ? false : theme.is_running;

        if (scaled) {
            logs.log(`✅ Service mis à 0 répliques.`);
            if (theme.is_running !== newRunningState) {
                theme.is_running = newRunningState;
                try { await theme.save(); logs.log(`📊 is_running Thème MàJ -> false`); }
                catch (e) { logs.notifyErrors('❌ Erreur save après stop Swarm', {}, e); }
            }
        } else { logs.logErrors(`❌ Échec scale down Swarm.`); }
        return { success: scaled, theme, logs };
    }

    /** Démarre le service Swarm d'un thème (scale à 1 et MAJ is_running). */
    async startThemeService(themeId: string | Theme, replicas: number = 1): Promise<ThemeServiceResult> {
        const logs = new Logs(`ThemeService.startThemeService (${themeId} -> ${replicas})`);
        const theme = typeof themeId == 'string' ? await Theme.find(themeId) : themeId;
        if (!theme) return { success: false, theme: null, logs: logs.logErrors(`❌ Thème ${themeId} non trouvé.`) };
        if (!theme.is_active) return { success: false, theme, logs: logs.logErrors(`❌ Thème ${themeId} inactif (is_active=false), démarrage non autorisé.`) };
        if (replicas <= 0) return { success: false, theme, logs: logs.logErrors('❌ Répliques > 0 requis.') }
        // Si déjà running ? On pourrait juste retourner true.
        if (theme.is_running && replicas >= 1) return { success: true, theme, logs: logs.log(`ℹ️ Thème déjà running (${replicas} replica).`) }

        const serviceName = `theme_${theme.id}`;
        logs.log(`📈 Démarrage Swarm Thème '${serviceName}' -> ${replicas}...`);
        const scaled = await SwarmService.scaleService(serviceName, replicas);
        const newRunningState = scaled ? true : theme.is_running;

        if (scaled) {
            logs.log(`✅ Service mis à ${replicas} répliques.`);
            if (theme.is_running !== newRunningState) {
                theme.is_running = newRunningState;
                try { await theme.save(); logs.log(`📊 is_running Thème MàJ -> true`); }
                catch (e) { logs.notifyErrors('❌ Erreur save après start Swarm', {}, e); }
            }
        } else { logs.logErrors(`❌ Échec scale up Swarm.`); }
        return { success: scaled, theme, logs };
    }

    /** Redémarre les tâches du service Swarm d'un thème. */
    async restartThemeService(themeId: string | Theme): Promise<ThemeServiceResult> {
        const logs = new Logs(`ThemeService.restartThemeService (${themeId})`);
        const theme = typeof themeId == 'string' ? await Theme.find(themeId) : themeId;
        if (!theme) return { success: false, theme: null, logs: logs.logErrors(`❌ Thème ${themeId} non trouvé.`) };

        const serviceName = `theme_${theme.id}`;
        // Si on le redémarre, il doit être running ensuite
        const expectedRunningState = true;
        try {
            // (Logique restart via forceUpdate comme avant)
            const service = SwarmService.docker.getService(serviceName);
            const serviceInfo = await service.inspect();
            const version = serviceInfo.Version.Index;

            await service.update({
                ...serviceInfo.Spec,
                version,
                TaskTemplateForceUpdate: (serviceInfo.Spec.TaskTemplate?.ForceUpdate || 0) + 1
            });
            logs.log('✅ Redémarrage service Swarm demandé.');

            // S'assure que is_running est true
            if (theme.is_running !== expectedRunningState) {
                theme.is_running = expectedRunningState;
                await theme.save();
                logs.log("📊 is_running thème forcé à true après restart.")
            }
            return { success: true, theme, logs };
        } catch (error: any) { /* (gestion 404 et autres erreurs) */
            if (error.statusCode === 404) logs.logErrors(`❌ Service ${serviceName} non trouvé.`);
            else logs.notifyErrors(`❌ Erreur demande redémarrage Swarm`, {}, error);
            return { success: false, theme, logs };
        }
    }

    /** Met à jour un thème (rolling update image tag). */
    async updateThemeVersion(themeId: string | Theme, newImageTag: string): Promise<ThemeServiceResult> {
        const logs = new Logs(`ThemeService.updateThemeVersion (${themeId} -> ${newImageTag})`);
        const theme = typeof themeId == 'string' ? await Theme.find(themeId) : themeId;
        if (!theme) return { success: false, theme: null, logs: logs.logErrors(`❌ Thème non trouvé.`) };
        if (!theme.is_active) return { success: false, theme, logs: logs.logErrors("❌ Thème inactif, MàJ version non autorisée.") };

        const serviceName = `theme_${theme.id}`;

        const service = await SwarmService.getExistingService(serviceName)
        if (!service) {
            await this.createOrUpdateAndRunTheme(theme.$attributes as any,async()=>theme.preview_images,async()=>theme.preview_images,true);
        }
        try {
            // (Logique Swarm update spec + service.update comme avant)
            logs.log(`🔄 Préparation MàJ Swarm '${serviceName}' -> tag ${newImageTag}...`);
            const currentServiceInfo = await SwarmService.inspectService(serviceName);
            if (!currentServiceInfo) throw new Error("Service Swarm non trouvé.");
            const currentSpec = currentServiceInfo.Spec; const version = currentServiceInfo.Version.Index;

            const newTaskSpec: Dockerode.TaskSpec = {
                ...currentSpec?.TaskTemplate, // Hérite de TOUT le TaskTemplate actuel
                ContainerSpec: {
                    ...(currentSpec?.TaskTemplate?.ContainerSpec), // Hérite ContainerSpec
                    Image: theme.fullImageName // Change SEULEMENT l'image
                },
                // S'assurer que Networks est présent si la currentSpec l'avait dans TaskTemplate
                // Cette recopie implicite par "...currentSpec?.TaskTemplate" devrait suffire si la conf initiale était bonne
                Networks: currentSpec?.TaskTemplate?.Networks || defaultNetworks
            };
            // Préparer les options pour service.update
            const updateOptions: ServiceUpdateOptions = {
                version,
                Name: currentSpec?.Name, // Utilise les infos de currentSpec
                Labels: currentSpec?.Labels,
                Mode: currentSpec?.Mode,
                UpdateConfig: currentSpec?.UpdateConfig,
                RollbackConfig: currentSpec?.RollbackConfig,
                EndpointSpec: currentSpec?.EndpointSpec,
                // La spec réseau n'est PAS à la racine
                TaskTemplate: newTaskSpec, // Utilise notre newTaskSpec corrigée
            };

            // Appel Docker Swarm Update
            await SwarmService.docker.getService(serviceName).update(updateOptions);
            logs.log(`✅ Mise à jour Swarm demandée.`);


            // MAJ BDD
            theme.docker_image_tag = newImageTag;
            // S'assure is_running = true
            if (!theme.is_running) theme.is_running = true;
            await theme.save();
            logs.log(`✅ Tag image & is_running MàJ BDD: ${newImageTag}.`);

            return { success: true, theme, logs };

        } catch (error) {
            logs.notifyErrors(`❌ Erreur MàJ version thème`, { themeId, newImageTag }, error);
            // Si Swarm a échoué mais la BDD était OK avant, on ne touche pas la BDD? Ou on remet is_running?
            return { success: false, theme, logs };
        }
    }

    /** Active ou désactive un thème globalement. */
    async setThemeActiveStatus(themeId: string | Theme, isActive: boolean): Promise<ThemeServiceResult> {
        const logs = new Logs(`ThemeService.setThemeActiveStatus (${themeId} -> ${isActive})`);
        const theme = typeof themeId == 'string' ? await Theme.find(themeId) : themeId;
        if (!theme) return { success: false, theme: null, logs: logs.logErrors(`❌ Thème ${themeId} non trouvé.`) };

        if (theme.is_default && !isActive) return { success: false, theme, logs: logs.logErrors("❌ Désactivation thème par défaut interdite.") };

        if (theme.is_active === isActive) return { success: true, theme, logs: logs.log(`ℹ️ Thème déjà dans cet état ${isActive ? "actif" : 'inactif'}.`) };

        theme.is_active = isActive;
        try {
            await theme.save();
            logs.log(`✅ Statut is_active Thème ${theme.id} mis à jour: ${isActive}.`);

            // Si on désactive, il faut aussi arrêter le service Swarm associé !
            if (!isActive) {
                logs.log("   -> Thème désactivé, arrêt du service Swarm...");
                await this.stopThemeService(theme.id); // Appelle la méthode qui gère scale 0 + is_running
            } else {
                //TODO Si on active, faut-il démarrer le service? Pas forcément, il démarrera peut-être
                // seulement si un store l'utilise ou si l'admin le fait explicitement. Laissons
                // startThemeService pour un démarrage explicite.
            }
            return { success: true, theme, logs };
        } catch (error) {
            logs.notifyErrors(`❌ Erreur sauvegarde/arrêt lors de changement is_active`, {}, error);
            return { success: false, theme, logs };
        }
    }
    async setDefaultTheme(themeId: string | Theme) { // Renvoie ServiceResult
        const logs = new Logs(`ThemeService.setDefaultTheme (${themeId})`);
        const theme = typeof themeId == 'string' ? await Theme.find(themeId) : themeId;
        if (!theme) return { /* ... not found ... */ };
        if (theme.is_default) return { success: true, data: theme, logs: logs.log("ℹ️ Thème déjà par défaut.") };
        if (!theme.is_active) return { success: false, clientMessage: "Impossible de définir un thème inactif comme défaut.", logs: logs.logErrors("❌ Thème inactif.") };

        const trx = await db.transaction(); // Transaction pour la sécurité
        try {
            // Désactiver l'ancien DANS la transaction
            await Theme.query({ client: trx }).where('is_default', true).update({ is_default: false });
            // Activer le nouveau DANS la transaction
            theme.useTransaction(trx);
            theme.is_default = true;
            await theme.save();
            await trx.commit(); // Valide les deux opérations
            logs.log(`✅ Thème ${theme.id} défini comme défaut.`);
            return { success: true, theme, logs };
        } catch (error) {
            await trx.rollback();
            logs.notifyErrors("❌ Erreur transaction set default", { themeId: theme.id }, error);
            logs.result = theme;
            return { success: false, error: error.message, clientMessage: "Erreur serveur lors de la définition du thème par défaut.", logs };
        }
    }
}

export default new ThemeService();