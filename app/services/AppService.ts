// s_server/app/services/AppService.ts (NOUVEAU)
import SwarmService from '#services/SwarmService';
import logger from '@adonisjs/core/services/logger'; // Utiliser le logger AdonisJS
import { Logs } from '../Utils/functions.js';
import env from '#start/env';
import Dockerode from 'dockerode';

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

   

    // s_server/app/services/AppService.ts (extrait de startAppService)
async startAppService(serviceId: string, defaultReplicas: number = 1): Promise<AppServiceResult> {
    const logs = new Logs(`AppService.startAppService (${serviceId} -> ${defaultReplicas} replicas)`);
    const serviceName = serviceId; // Pour les apps globales, serviceId est le nom Swarm

    try {
        const existingService = await SwarmService.inspectService(serviceName);
        if (!existingService) {
            logs.log(`[AppService] Service ${serviceName} non trouvé. Création...`);
            // On a besoin de la spec de base pour ce service applicatif
            const appSpec = this.getAppServiceSpec(serviceName, defaultReplicas); // Nouvelle méthode
            if (!appSpec) {
                logs.logErrors(`[AppService] Impossible de construire la spec pour ${serviceName}.`);
                return { success: false, logs, appName: serviceName };
            }
            const createdService = await SwarmService.createOrUpdateService(serviceName, appSpec); // createOrUpdate gère la création
            const success = !!createdService;
            if (success) logs.log(`[AppService] Service ${serviceName} créé avec ${defaultReplicas} répliques.`);
            else logs.logErrors(`[AppService] Échec création service ${serviceName}.`);
            return { success, logs, appName: serviceName, replicas: success ? defaultReplicas : 0 };
        } else {
            // Le service existe, on s'assure qu'il a le bon nombre de répliques
            logs.log(`[AppService] Service ${serviceName} existant. Vérification/Mise à l'échelle à ${defaultReplicas} répliques...`);
            return this.scaleAppService(serviceName, defaultReplicas);
        }
    } catch (error) {
        logs.notifyErrors(`❌ Erreur démarrage/création service ${serviceName}`, {}, error);
        return { success: false, logs, appName: serviceName };
    }
}

// NOUVELLE MÉTHODE dans AppService.ts
private getAppServiceSpec(serviceName: string, replicas: number): Dockerode.ServiceSpec | null {
    // Lire la configuration depuis env ou une base de données de config
    // pour l'image, le port interne, les variables d'env spécifiques, etc.
    let imageName: string | undefined;
    let internalPort: number | undefined;
    let serviceEnvVars: Record<string, string | undefined> = {
        NODE_ENV: env.get('NODE_ENV', 'production'),
        HOST: '0.0.0.0',
        S_SERVER_URL: `http://s_server:${env.get('PORT', '5555')}`,
        SERVICE_ID:serviceName,
        REDIS_HOST:'sublymus_infra_redis',
        TARGET_API_HEADER:'x-target-api-service', 
        STORE_URL_HEADER:'x-base-url',
        SERVER_URL_HEADER:'x-server-url',
        VAPID_PUBLIC_KEY: env.get('VAPID_PUBLIC_KEY'),
        VAPID_PRIVATE_KEY: env.get('VAPID_PRIVATE_KEY'),
        VAPID_SUBJECT: env.get('VAPID_SUBJECT'),
    };

    switch (serviceName) {
        case  env.get('APP_SERVICE_WELCOME', 's_welcome'):
            imageName = `sublymus/s_welcome:latest`;
            internalPort = parseInt(env.get('S_WELCOME_INTERNAL_PORT', '3003'));
            serviceEnvVars.PORT = internalPort.toString();
            // Ajouter des envs spécifiques à s_welcome
            break;
        case  env.get('APP_SERVICE_DASHBOARD', 's_dashboard'):
            imageName = `sublymus/s_dashboard:latest`;
            internalPort = parseInt(env.get('S_DASHBOARD_INTERNAL_PORT', '3005'));
            break;
        case  env.get('APP_SERVICE_DOCS', 's_docs'):
            imageName = `sublymus/s_docs:latest`;
            internalPort = parseInt(env.get('S_DOCS_INTERNAL_PORT', '3007')); // Tu avais 3004 ici
            serviceEnvVars.PORT = internalPort.toString();
            break;
        case  env.get('APP_SERVICE_ADMIN', 's_admin'):
            imageName = `sublymus/s_admin:latest`;
            internalPort = parseInt(env.get('S_ADMIN_INTERNAL_PORT', '3008')); // Tu avais 3004 ici
            serviceEnvVars.PORT = internalPort.toString();
            break;
        default:
            logger.error(`[AppService] Spécification inconnue pour le service applicatif: ${serviceName}`);
            return null;
    }

    if (!imageName || !internalPort) {
        logger.error(`[AppService] Configuration manquante (image ou port) pour ${serviceName}`);
        return null;
    }


    return SwarmService.constructGenericAppServiceSpec({ 
        serviceName,
        imageName,
        replicas,
        internalPort,
        envVars: serviceEnvVars,
        resources: 'medium', // Ou un paramètre de ressources spécifique aux apps
        // networks: defaultNetworks, // Déjà dans constructGeneric...
    });
}
}

export default new AppService();