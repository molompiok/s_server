// s_server/app/services/PlatformOrchestratorService.ts
import StoreService from '#services/StoreService';
import ThemeService from '#services/ThemeService';
import AppService from '#services/AppService'; // Service à créer pour les apps globales
import Store from '#models/store';
import Theme from '#models/theme';
import logger from '@adonisjs/core/services/logger';
import env from '#start/env'; // Pour les noms des apps globales

const GLOBAL_APP_SERVICES = [ // Noms des services Swarm pour les apps globales
    env.get('APP_SERVICE_WELCOME', 's_welcome'),
    env.get('APP_SERVICE_DASHBOARD', 's_dashboard'),
    env.get('APP_SERVICE_DOCS', 's_docs'),
    // env.get('APP_SERVICE_ADMIN', 's_admin'),
    // 's_admin' // Ajouter quand prêt
].filter(Boolean); // Filtrer les valeurs undefined/null si une var d'env n'est pas définie

class PlatformOrchestratorService {

    public async synchronizePlatformState(): Promise<void> {
        logger.info('[PlatformOrchestrator] Début de la synchronisation de l\'état de la plateforme...');

        // --- 1. Synchronisation des Thèmes ---
        try {
            logger.info('[PlatformOrchestrator] Synchronisation des services de Thèmes...');
            const allThemes = await Theme.all();
            for (const theme of allThemes) {
                if (theme.is_active) {
                    // Le service ThemeService.createOrUpdateAndRunTheme est idempotent
                    // et s'assurera que le service Swarm est lancé s'il est actif en BDD.
                    // Il gère aussi l'état is_running.
                    // On pourrait aussi appeler directement ThemeService.startThemeService(theme)
                    // si on est sûr que la spec est déjà correcte dans Swarm.
                    // Pour plus de robustesse, createOrUpdateAndRunTheme est bien.
                    logger.info(`[PlatformOrchestrator] Vérification/Démarrage thème ${theme.id} (${theme.name})`);
                    // Attention: createOrUpdateAndRunTheme a besoin de plus de params s'il doit créer l'image/les fichiers.
                    // Ici, on suppose que l'image Docker existe déjà. On va plutôt utiliser start/stop.
                    if (!theme.is_running) { // Si la BDD dit qu'il ne tourne pas mais devrait
                        await ThemeService.startThemeService(theme);
                    } else {
                        // Optionnel: Forcer un restart pour s'assurer qu'il a la dernière conf/image ?
                        // Ou juste vérifier qu'il tourne avec le bon nombre de répliques (1 par défaut)
                        await ThemeService.startThemeService(theme, 1); // Assure au moins 1 réplique
                    }

                } else {
                    // Si inactif en BDD, s'assurer qu'il est arrêté
                    logger.info(`[PlatformOrchestrator] Vérification/Arrêt thème ${theme.id} (${theme.name})`);
                    if (theme.is_running) { // Si la BDD dit qu'il tourne alors qu'il devrait être inactif
                        await ThemeService.stopThemeService(theme);
                    }
                }
            }
            logger.info('[PlatformOrchestrator] Synchronisation des Thèmes terminée.');
        } catch (error) {
            logger.error(error, '[PlatformOrchestrator] Erreur lors de la synchronisation des Thèmes.');
        }

        // --- 2. Synchronisation des Applications Globales ---
        try {
            logger.info('[PlatformOrchestrator] Synchronisation des Applications Globales...');
            for (const appServiceName of GLOBAL_APP_SERVICES) {
                logger.info(`[PlatformOrchestrator] Vérification/Démarrage application ${appServiceName}`);
                // On suppose qu'elles doivent toujours tourner avec 1 réplique (ou plus si LoadMonitor le demande ensuite)
                // AppService.startAppService est idempotent et scale à 1 si 0.
                await AppService.startAppService(appServiceName, 1);
            }
            logger.info('[PlatformOrchestrator] Synchronisation des Applications Globales terminée.');
        } catch (error) {
            logger.error(error, '[PlatformOrchestrator] Erreur lors de la synchronisation des Applications Globales.');
        }


        // --- 3. Synchronisation des Stores et de leurs APIs ---
        try {
            logger.info('[PlatformOrchestrator] Synchronisation des Stores et APIs de boutique...');
            const allStores = await Store.all();
            for (const store of allStores) {
              
                const shouldBeRunning = store.is_active; // && store.should_be_running ; // TODO ajouter un must_be_running

                if (shouldBeRunning) {
                    logger.info(`[PlatformOrchestrator] Vérification/Démarrage store ${store.id} (${store.name})`);
                    await StoreService.startStoreService(store);
                } else {
                    // Si le store n'est pas actif (ou ne devrait pas tourner selon ta logique)
                    logger.info(`[PlatformOrchestrator] Vérification/Arrêt store ${store.id} (${store.name})`);
                    // StoreService.stopStoreService s'assure qu'il est scale à 0.
                    // Il mettra à jour store.is_running en BDD.
                    await StoreService.stopStoreService(store);
                }
            }
            logger.info('[PlatformOrchestrator] Synchronisation des Stores et APIs terminée.');
        } catch (error) {
            logger.error(error, '[PlatformOrchestrator] Erreur lors de la synchronisation des Stores.');
        }

        logger.info('[PlatformOrchestrator] Synchronisation de l\'état de la plateforme terminée.');
    }
}

export default new PlatformOrchestratorService();