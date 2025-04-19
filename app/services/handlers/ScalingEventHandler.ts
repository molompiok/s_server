// s_server/app/services/event_handlers/ScalingEventHandler.ts
import type { Job } from 'bullmq';
import SwarmService from '#services/SwarmService';
import StoreService from '#services/StoreService';
import ThemeService from '#services/ThemeService'; // <<< AJOUTER ThemeService
import logger from '@adonisjs/core/services/logger'; // <<< AJOUTER Logger

// Interface pour les données attendues dans les jobs de scaling
interface ScaleJobData {
    serviceType: 'api' | 'theme';
    serviceId: string; // storeId pour 'api', themeId pour 'theme'
    // Ajouter d'autres données si nécessaire (ex: requestedBy?)
}

export class ScalingEventHandler {
    // Injecter SwarmService, StoreService, ThemeService si s_server est AdonisJS

    /**
     * Gère la demande de mise à l'échelle vers le haut.
     */
    async handleScaleUpRequest(job: Job<{ event: string, data: ScaleJobData }>) {
        const { serviceType, serviceId } = job.data.data;
        logger.info({ jobId: job.id, serviceType, serviceId }, `[ScalingEventHandler] Processing scale UP request`);

        const isApi = serviceType === 'api';
        const entityId = serviceId; // storeId ou themeId
        const serviceName = isApi ? `api_store_${entityId}` : `theme_${entityId}`;

        try {
            const serviceInfo = await SwarmService.inspectService(serviceName);
            if (!serviceInfo) {
                logger.error({ serviceName }, `[ScalingEventHandler] Service not found for scaling UP.`);
                return; // Ne pas faire échouer, service potentiellement supprimé
            }

            const currentReplicas = serviceInfo.Spec.Mode?.Replicated?.Replicas ?? 0;
            logger.info({ serviceName, currentReplicas }, `[ScalingEventHandler] Current replicas`);

            const newReplicas = currentReplicas + 1;

            // --- TODO: Vérifier les limites d'abonnement/plan ici ---
            // const entity = isApi ? await Store.find(entityId) : await Theme.find(entityId);
            // if (!entity || newReplicas > entity.getMaxAllowedReplicas()) { // Méthode à créer
            //    logger.warn({ serviceName, newReplicas }, `[ScalingEventHandler] Scale UP limit reached.`);
            //    return;
            // }
            // --- Fin TODO ---

            logger.info({ serviceName, newReplicas }, `[ScalingEventHandler] Attempting to scale UP...`);

            let scaleResult: { success: boolean, logs?: any }; // Adapter le type retour si besoin

            if (isApi) {
                scaleResult = await StoreService.scaleStoreService(entityId, newReplicas);
            } else {
                // >>>>> Appel à ThemeService pour scaler le thème <<<<<
                scaleResult = await ThemeService.startThemeService(entityId, newReplicas); // Ou une méthode scale dédiée si créée
            }

            if (scaleResult.success) {
                logger.info({ serviceName, newReplicas }, `[ScalingEventHandler] Scaling UP successful.`);
            } else {
                logger.error({ serviceName, logs: scaleResult.logs?.getMessages() }, `[ScalingEventHandler] Scaling UP failed.`);
                throw new Error(`${serviceType} service scaling failed for ${entityId}`);
            }

        } catch (error) {
            logger.error({ serviceName, jobId: job.id, error: error.message }, `[ScalingEventHandler] Error during scale UP`);
            throw error; // Relancer pour retry
        }
    }

    /**
     * Gère la demande de mise à l'échelle vers le bas.
     * @param job Le job BullMQ complet.
     */
    async handleScaleDownRequest(job: Job<{ event: string, data: ScaleJobData }>) {
        const { serviceType, serviceId } = job.data.data;
        logger.info({ jobId: job.id, serviceType, serviceId }, `[ScalingEventHandler] Processing scale DOWN request`);

        const isApi = serviceType === 'api';
        const entityId = serviceId; // storeId ou themeId
        const serviceName = isApi ? `api_store_${entityId}` : `theme_${entityId}`;
        const MIN_REPLICAS = 1; // <<< Définir le minimum de répliques (peut être 0 si l'arrêt complet est autorisé)

        try {
            const serviceInfo = await SwarmService.inspectService(serviceName);
            if (!serviceInfo) {
                logger.warn({ serviceName }, `[ScalingEventHandler] Service not found for scaling DOWN. Assuming already scaled down.`);
                return; // Service n'existe plus, on considère que c'est OK.
            }

            const currentReplicas = serviceInfo.Spec.Mode?.Replicated?.Replicas ?? 0;
            logger.info({ serviceName, currentReplicas }, `[ScalingEventHandler] Current replicas`);

            if (currentReplicas <= MIN_REPLICAS) {
                logger.info({ serviceName, currentReplicas, minReplicas: MIN_REPLICAS }, `[ScalingEventHandler] Already at or below minimum replicas. No scale down needed.`);
                return; // Déjà au minimum, on ne fait rien.
            }

            const newReplicas = currentReplicas - 1;

            // Pas besoin de vérifier les limites pour scale down, mais on respecte le MIN_REPLICAS déjà vérifié

            logger.info({ serviceName, newReplicas }, `[ScalingEventHandler] Attempting to scale DOWN...`);

            let scaleResult: { success: boolean, logs?: any };

            if (isApi) {
                scaleResult = await StoreService.scaleStoreService(entityId, newReplicas);
            } else {
                // >>>>> Appel à ThemeService pour scaler le thème <<<<<
                 if (newReplicas > 0) {
                     // Si on réduit mais > 0, utiliser la méthode de scaling
                     scaleResult = await ThemeService.startThemeService(entityId, newReplicas); // start/scale
                 } else {
                     // Si on réduit à 0, utiliser la méthode d'arrêt
                     scaleResult = await ThemeService.stopThemeService(entityId);
                 }
            }

            if (scaleResult.success) {
                logger.info({ serviceName, newReplicas }, `[ScalingEventHandler] Scaling DOWN successful.`);
            } else {
                logger.error({ serviceName, logs: scaleResult.logs?.getMessages() }, `[ScalingEventHandler] Scaling DOWN failed.`);
                 // Faire échouer pour retry ? Si ça échoue, le nombre de répliques reste élevé... Peut-être juste loguer.
                 throw new Error(`${serviceType} service scaling failed for ${entityId}`);
            }

        } catch (error) {
            logger.error({ serviceName, jobId: job.id, error: error.message }, `[ScalingEventHandler] Error during scale DOWN`);
            throw error; // Relancer pour retry
        }
    }
}

// Exporter une instance ou gérer via IoC
export default new ScalingEventHandler();