// s_server/app/services/AppService.ts (NOUVEAU)
import SwarmService from '#services/SwarmService';
import logger from '@adonisjs/core/services/logger'; // Utiliser le logger AdonisJS
import { Logs } from '../Utils/functions.js';

interface AppServiceResult {
    success: boolean;
    logs: Logs;
    appName?: string;
    replicas?: number;
}

class AppService {

    /**
     * Met à l'échelle un service d'application global.
     * Le serviceId ici est le nom du service Swarm (ex: "s_welcome", "s_dashboard").
     */
    async scaleAppService(serviceId: string, replicas: number): Promise<AppServiceResult> {
        const logs = new Logs(`AppService.scaleAppService (${serviceId} -> ${replicas} replicas)`);
        if (replicas < 0) { // Un service applicatif global pourrait descendre à 0 replica s'il n'est pas critique
            return { success: false, logs: logs.logErrors('❌ Nombre de répliques doit être >= 0.') };
        }

        // Le serviceId EST le nom du service Swarm pour les apps globales
        const serviceName = serviceId;
        logger.info({ serviceName, replicas }, `[AppService] Scaling application service...`);

        const scaled = await SwarmService.scaleService(serviceName, replicas);

        if (scaled) {
            logs.log(`✅ Scaling Swarm OK pour ${serviceName}.`);
            logger.info({ serviceName, replicas }, `[AppService] Scaling successful.`);
        } else {
            logs.logErrors(`❌ Échec scaling Swarm pour ${serviceName}.`);
            logger.error({ serviceName, replicas }, `[AppService] Scaling failed.`);
        }
        return { success: scaled, logs, appName: serviceName, replicas };
    }

    // On pourrait ajouter des méthodes start/stop/restart si nécessaire,
    // qui appelleraient scaleAppService avec replicas=1 ou replicas=0, ou SwarmService.restartService.
    // Exemple pour stop:
    async stopAppService(serviceId: string): Promise<AppServiceResult> {
        return this.scaleAppService(serviceId, 0);
    }

    // Exemple pour start (à 1 replica par défaut):
    async startAppService(serviceId: string, defaultReplicas: number = 1): Promise<AppServiceResult> {
        return this.scaleAppService(serviceId, defaultReplicas);
    }
}

export default new AppService();