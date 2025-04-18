//s_server/app/services/handlers/ScalingEventHandler.ts
import type { Job } from 'bullmq';
import SwarmService from '#services/SwarmService'; // Adapter les chemins si nécessaire
import StoreService from '#services/StoreService';
// import Store from '#models/store'; // Potentiellement nécessaire pour les limites

export class ScalingEventHandler {
    // Injecter SwarmService et StoreService si s_server est AdonisJS
    // constructor(private swarmService: SwarmService, ...) {}

    /**
     * Gère la demande de mise à l'échelle vers le haut.
     * @param job Le job BullMQ complet.
     */
    async handleScaleUpRequest(job: Job<{ event: string, data: { serviceType: string, serviceId: string } }>) {
        const scaleData = job.data.data;
        console.log(`[ScalingEventHandler] Processing scale UP request for ${scaleData.serviceId} (Job ID: ${job.id})`);

        if (scaleData.serviceType === 'api' && scaleData.serviceId) {
            const storeId = scaleData.serviceId;
            const serviceName = `api_store_${storeId}`;

            try {
                const serviceInfo = await SwarmService.inspectService(serviceName);
                if (!serviceInfo) {
                    console.error(`[ScalingEventHandler] Service ${serviceName} not found for scaling.`);
                    // Ne pas relancer l'erreur ici, le job sera considéré comme terminé.
                    return;
                }

                const currentReplicas = serviceInfo.Spec.Mode?.Replicated?.Replicas ?? 0;
                console.log(`[ScalingEventHandler] Current replicas for ${serviceName}: ${currentReplicas}`);

                const newReplicas = currentReplicas + 1;

                // TODO: Vérifier les limites d'abonnement ici
                // const store = await Store.find(storeId);
                // if (!store || newReplicas > store.getMaxAllowedReplicas()) {
                //    console.warn(`[ScalingEventHandler] Scale limit reached for ${storeId}.`);
                //    return; // Ne pas faire échouer le job
                // }

                console.log(`[ScalingEventHandler] Attempting to scale ${serviceName} to ${newReplicas} replicas...`);
                const scaleResult = await StoreService.scaleStoreService(storeId, newReplicas);

                if (scaleResult.success) {
                    console.log(`[ScalingEventHandler] Scaling successful for ${serviceName}.`);
                } else {
                    console.error(`[ScalingEventHandler] Scaling failed for ${serviceName}. Logs:`, scaleResult.logs.errors);
                    // Faire échouer le job pour que BullMQ puisse le retenter
                    throw new Error(`StoreService scaling failed for ${serviceName}`);
                }

            } catch (error) {
                console.error(`[ScalingEventHandler] Error during scale UP for ${serviceName} (Job ID: ${job.id}):`, error);
                // Relancer l'erreur pour que BullMQ gère le retry
                throw error;
            }
        } else {
            console.warn(`[ScalingEventHandler] Invalid scale UP request data (Job ID: ${job.id}):`, scaleData);
        }
    }

    // async handleScaleDownRequest(job: Job) { ... }
}

// Exporter une instance ou gérer via IoC
export default new ScalingEventHandler();