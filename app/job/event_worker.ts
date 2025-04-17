// Exemple : s_server/app/jobs/service_event_worker.ts (à lancer séparément)
import StoreService from '#services/StoreService';
import SwarmService from '#services/SwarmService';
import { Worker } from 'bullmq';
import IORedis from 'ioredis'; // Ou utiliser la connexion de RedisService si possible

// Récupérer les infos de connexion Redis depuis l'environnement
const redisHost = process.env.REDIS_HOST || '127.0.0.1';
const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);
// const redisPassword = process.env.REDIS_PASSWORD;

const queueName = 'service-to-server+s_server'; // La queue à écouter

console.log(`[s_server Worker] Initializing worker for queue: ${queueName}`);

// Créer la connexion Redis dédiée
//@ts-ignore
const connection = new IORedis(redisPort, redisHost, {
    //   password: redisPassword,
    maxRetriesPerRequest: null,
    // enableReadyCheck: false,
});

connection.on('connect', () => console.log(`[s_server Worker] Redis connection established.`));
connection.on('error', (err: any) => console.error(`[s_server Worker] Redis connection error:`, err));

// Créer le Worker
const worker = new Worker(
    queueName,
    async (job) => {
        console.log(`[s_server Worker] Received job: ${job.id}, Event: ${job.data.event}`);

        // === Logique de traitement des messages ===
        switch (job.data.event) {
            case 'admin_pong':
                const pongData = job.data.data;
                console.log(`[s_server Worker] ===> PONG reçu du Store ${pongData.storeId}! (Timestamp: ${pongData.timestamp})`);
                // Ici, on pourrait notifier un admin, mettre à jour un statut, etc.
                break;
            case 'request_scale_up':
                const scaleData = job.data.data;
                console.log(`[s_server Worker] Received scale UP request:`, scaleData);

                if (scaleData.serviceType === 'api' && scaleData.serviceId) {
                    const storeId = scaleData.serviceId;
                    const serviceName = `api_store_${storeId}`; // Nom du service Swarm

                    try {
                        // 1. Obtenir le nombre actuel de répliques
                        const serviceInfo = await SwarmService.inspectService(serviceName);
                        if (!serviceInfo) {
                            console.error(`[s_server Worker] Service ${serviceName} not found for scaling.`);
                            // Ne pas faire échouer le job, juste logguer l'erreur
                            return;
                        }
                        // Le nombre actuel est dans Mode.Replicated.Replicas
                        const currentReplicas = serviceInfo.Mode?.Replicated?.Replicas ?? 0;
                        console.log(`[s_server Worker] Current replicas for ${serviceName}: ${currentReplicas}`);

                        // 2. Décider du nouveau nombre de répliques (logique simple : +1)
                        const newReplicas = currentReplicas + 1;

                        // 3. TODO: Vérifier les limites de l'abonnement du client, etc.
                        // Exemple : const store = await Store.find(storeId);
                        //          if (newReplicas > store.getMaxAllowedReplicas()) { ... }

                        // 4. Appeler StoreService pour appliquer le scaling
                        console.log(`[s_server Worker] Scaling ${serviceName} from ${currentReplicas} to ${newReplicas} replicas...`);
                        // Utilise la méthode de StoreService qui gère le scale ET la mise à jour de is_running
                        const scaleResult = await StoreService.scaleStoreService(storeId, newReplicas);

                        if (scaleResult.success) {
                            console.log(`[s_server Worker] Scaling successful for ${serviceName}.`);
                        } else {
                            console.error(`[s_server Worker] Scaling failed for ${serviceName}.`);
                            // Peut-être relancer l'erreur pour un retry ? Dépend de la cause.
                            // throw new Error(`Scaling failed for ${serviceName}`);
                        }

                    } catch (error) {
                        console.error(`[s_server Worker] Error processing scale UP for ${serviceName}:`, error);
                        // Faire échouer le job pour un potentiel retry
                        throw error;
                    }

                } else {
                    console.warn(`[s_server Worker] Invalid scale UP request data:`, scaleData);
                }
                break;
            // --- Ajouter d'autres 'case' ici ---
            // case 'request_scale_up':
            //   console.log(`[s_server Worker] Demande de scale UP reçue`, job.data.data);
            //   // Appeler StoreService.scaleStoreService(...)
            //   break;
            // case 'new_order':
            //  console.log(`[s_server Worker] Nouvelle commande signalée`, job.data.data);
            //  // Déclencher notification email, etc.
            //  break;
            default:
                console.warn(`[s_server Worker] Événement inconnu reçu: ${job.data.event}`);
        }
    },
    {
        connection: connection,
        concurrency: 10 // Peut traiter plus de messages en parallèle
    }
);

worker.on('completed', (job) => {
    console.log(`[s_server Worker] Job ${job.id} (${job.data.event}) completed.`);
});

worker.on('failed', (job, err) => {
    console.error(`[s_server Worker] Job ${job?.id} (${job?.data?.event}) failed:`, err);
});

worker.on('error', err => {
    console.error(`[s_server Worker] Worker error:`, err);
});

console.log(`[s_server Worker] Worker started and listening on queue ${queueName}.`);

// Gestion de l'arrêt propre
const shutdown = async () => {
    console.log(`[s_server Worker] Shutting down worker...`);
    await worker.close();
    await connection.quit();
    console.log(`[s_server Worker] Worker shut down.`);
    process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);