// s_server/start/platform_orchestrator.ts
import app from '@adonisjs/core/services/app';
import PlatformOrchestratorService from '#services/PlatformOrchestratorService';
import logger from '@adonisjs/core/services/logger';
import env from './env.js';

if (app.getEnvironment() === 'web') { // S'exécute seulement pour le serveur web principal, pas ace commands
    app.ready(async () => {
        // Attendre un peu que Docker et les autres services soient potentiellement prêts
        // Ceci est une mesure de précaution, Swarm devrait déjà être là.
        await new Promise(resolve => setTimeout(resolve, 15000)); // Attendre 15 secondes

        logger.info('[PlatformBootstrap] s_server est prêt. Démarrage de la synchronisation de la plateforme...');
        try {
             env.get('NODE_ENV')=='production' && (
                 await PlatformOrchestratorService.synchronizePlatformState()
             )
        } catch (error) {
            logger.fatal(error, '[PlatformBootstrap] Erreur critique lors de la synchronisation initiale de la plateforme.');
            // Que faire ici ? L'application s_server tourne, mais la plateforme peut être inconsistante.
        }
    });
}