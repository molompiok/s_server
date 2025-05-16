// s_server/app/services/event_handlers/ScalingEventHandler.ts
import type { Job } from 'bullmq';
import SwarmService from '#services/SwarmService';
import StoreService from '#services/StoreService';
import ThemeService from '#services/ThemeService';
import AppService from '#services/AppService'; // NOUVEAU
import logger from '@adonisjs/core/services/logger';
import RedisService from '#services/RedisService';
// import RedisService from '#services/RedisService'; // Pour le verrouillage

const SCALING_OPERATION_LOCK_SECONDS = 30; // Verrou plus court pour permettre des ajustements rapides
const MIN_REPLICAS_API_THEME = 1; // Les APIs et Thèmes ne descendent pas en dessous de 1 (sauf arrêt explicite)
const MIN_REPLICAS_APP = 1;      // Les Apps globales aussi (sauf si on veut les arrêter complètement via LoadMonitor)

interface ScaleJobData {
  serviceType: 'api' | 'theme' | 'app';
  serviceId: string;
  reason?: string;
}

export class ScalingEventHandler {

  private async acquireLock(lockKey: string): Promise<boolean> {
    // return RedisService.client.set(lockKey, 'locked', 'EX', SCALING_OPERATION_LOCK_SECONDS, 'NX');
    const result = await RedisService.client.set(lockKey, 'locked', 'EX', SCALING_OPERATION_LOCK_SECONDS, 'NX');
    return result === 'OK';
  }

  private async releaseLock(lockKey: string): Promise<void> {
    await RedisService.deleteCache(lockKey);
   }


  async handleScaleUpRequest(job: Job<{ event: string, data: ScaleJobData }>) {
    const { serviceType, serviceId } = job.data.data;
    const logCtx = { jobId: job.id, serviceType, serviceId, direction: 'UP' };
    logger.info(logCtx, `[ScalingEventHandler] Processing scale UP request`);

    const lockKey = `scaling_lock:${serviceType}:${serviceId}`;
    if (!await this.acquireLock(lockKey)) {
      logger.info(logCtx, `[ScalingEventHandler] Lock active for ${serviceId}. Skipping scale UP.`);
      return; // Opération déjà en cours ou récente
    }

    try {
      const serviceName = this.getSwarmServiceName(serviceType, serviceId);
      const serviceInfo = await SwarmService.inspectService(serviceName);

      if (!serviceInfo) {
        logger.error(logCtx, `[ScalingEventHandler] Service ${serviceName} not found for scaling UP. Creating?`);
         if (serviceType === 'api') await StoreService.startStoreService(serviceId);
        else if (serviceType === 'theme') await ThemeService.startThemeService(serviceId);
        else if (serviceType === 'app') await AppService.startAppService(serviceId);
        else logger.warn(logCtx, `Unknown serviceType ${serviceType} for start after not found.`);
        return;
      }

      const currentReplicas = serviceInfo.Spec.Mode?.Replicated?.Replicas ?? 0;
      const newReplicas = currentReplicas + 1;

      logger.info({ ...logCtx, currentReplicas, newReplicas }, `[ScalingEventHandler] Attempting to scale UP...`);

      // TODO: Vérifier les limites max du plan ici avant de scaler
      if(newReplicas  > 5 ){
        logger.warn({ ...logCtx, newReplicas }, `Max replica limit reached for plan.`);  
        return
      }
      // if (newReplicas > getMaxReplicasForPlan(serviceType, serviceId)) {
      //   logger.warn({ ...logCtx, newReplicas }, `Max replica limit reached for plan.`);
      //   return;
      // }


      let scaleResult: { success: boolean, logs?: any };

      switch (serviceType) {
        case 'api':
          scaleResult = await StoreService.scaleStoreService(serviceId, newReplicas);
          break;
        case 'theme':
          scaleResult = await ThemeService.startThemeService(serviceId, newReplicas); // startThemeService gère le scale up
          break;
        case 'app':
          scaleResult = await AppService.scaleAppService(serviceId, newReplicas);
          break;
        default:
          logger.error(logCtx, `[ScalingEventHandler] Unknown serviceType: ${serviceType}`);
          throw new Error(`Unknown serviceType for scaling: ${serviceType}`);
      }

      if (scaleResult.success) {
        logger.info(logCtx, `[ScalingEventHandler] Scaling UP successful to ${newReplicas} replicas.`);
      } else {
        logger.error({ ...logCtx, logs: scaleResult.logs?.getMessages() }, `[ScalingEventHandler] Scaling UP failed.`);
        // Ne pas relancer l'erreur ici pour permettre au verrou d'expirer et éviter un retry immédiat sur échec de Swarm
        //throw new Error(`${serviceType} service scaling UP failed for ${serviceId}`);
      }
    } catch (error) {
      logger.error({ ...logCtx, err: error }, `[ScalingEventHandler] Error during scale UP`);
      throw error; // Relancer pour que BullMQ gère le retry du job
    } finally {
      await this.releaseLock(lockKey);
    }
  }

  async handleScaleDownRequest(job: Job<{ event: string, data: ScaleJobData }>) {
    const { serviceType, serviceId } = job.data.data;
    const logCtx = { jobId: job.id, serviceType, serviceId, direction: 'DOWN' };
    logger.info(logCtx, `[ScalingEventHandler] Processing scale DOWN request`);

    const lockKey = `scaling_lock:${serviceType}:${serviceId}`;
    if (!await this.acquireLock(lockKey)) {
      logger.info(logCtx, `[ScalingEventHandler] Lock active for ${serviceId}. Skipping scale DOWN.`);
      return;
    }

    try {
      const serviceName = this.getSwarmServiceName(serviceType, serviceId);
      const serviceInfo = await SwarmService.inspectService(serviceName);

      if (!serviceInfo) {
        logger.warn(logCtx, `[ScalingEventHandler] Service ${serviceName} not found for scaling DOWN. Assuming already scaled down.`);
        return;
      }

      const currentReplicas = serviceInfo.Spec.Mode?.Replicated?.Replicas ?? 0;
      const minReplicas = this.getMinReplicas(serviceType);

      if (currentReplicas <= minReplicas) {
        logger.info({ ...logCtx, currentReplicas, minReplicas }, `[ScalingEventHandler] Already at or below minimum replicas.`);
        return;
      }

      const newReplicas = currentReplicas - 1;
      logger.info({ ...logCtx, currentReplicas, newReplicas }, `[ScalingEventHandler] Attempting to scale DOWN...`);

      let scaleResult: { success: boolean, logs?: any };

      switch (serviceType) {
        case 'api':
          scaleResult = await StoreService.scaleStoreService(serviceId, newReplicas);
          break;
        case 'theme':
          if (newReplicas > 0) {
            scaleResult = await ThemeService.startThemeService(serviceId, newReplicas);
          } else {
            scaleResult = await ThemeService.stopThemeService(serviceId); // scale à 0
          }
          break;
        case 'app':
          scaleResult = await AppService.scaleAppService(serviceId, newReplicas);
          break;
        default:
          logger.error(logCtx, `[ScalingEventHandler] Unknown serviceType: ${serviceType}`);
          throw new Error(`Unknown serviceType for scaling: ${serviceType}`);
      }

      if (scaleResult.success) {
        logger.info(logCtx, `[ScalingEventHandler] Scaling DOWN successful to ${newReplicas} replicas.`);
      } else {
        logger.error({ ...logCtx, logs: scaleResult.logs?.getMessages() }, `[ScalingEventHandler] Scaling DOWN failed.`);
        //throw new Error(`${serviceType} service scaling DOWN failed for ${serviceId}`);
      }
    } catch (error) {
      logger.error({ ...logCtx, err: error }, `[ScalingEventHandler] Error during scale DOWN`);
      throw error;
    } finally {
      await this.releaseLock(lockKey);
    }
  }

  private getSwarmServiceName(serviceType: 'api' | 'theme' | 'app', serviceId: string): string {
    switch (serviceType) {
      case 'api': return `api_store_${serviceId}`;
      case 'theme': return `theme_${serviceId}`;
      case 'app': return serviceId; // Pour les apps, serviceId est le nom du service (ex: 's_welcome')
      default: throw new Error(`Unknown serviceType in getSwarmServiceName: ${serviceType}`);
    }
  }

  private getMinReplicas(serviceType: 'api' | 'theme' | 'app'): number {
    switch (serviceType) {
      case 'api':
      case 'theme':
        return MIN_REPLICAS_API_THEME;
      case 'app':
        return MIN_REPLICAS_APP;
      default:
        return 1;
    }
  }
}

export default new ScalingEventHandler();