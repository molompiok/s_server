// s_server/app/jobs/service_event_worker.ts
import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';

// Importer les nouveaux handlers
import AdminEventHandler from '#services/handlers/AdminEventHandler';
import ScalingEventHandler from '#services/handlers/ScalingEventHandler';
import NotificationEventHandler from '#services/handlers/NotificationEventHandler';
// Importer d'autres si nécessaire

// ... configuration connexion Redis ...
const redisHost = process.env.REDIS_HOST || '127.0.0.1';
const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);
const queueName = 'service-to-server+s_server';
//@ts-ignore
const connection = new IORedis(redisPort, redisHost, { maxRetriesPerRequest: null });
connection.on('connect', () => console.log(`[s_server Worker] Redis connection established.`));
connection.on('error', (err: any) => console.error(`[s_server Worker] Redis connection error:`, err));

/**
 * Fonction principale de traitement des jobs, qui délègue aux services handlers.
 */
async function processJob(job: Job<any>) { // Type 'any' ici car on ne connaît pas la structure de data à ce niveau
    console.log(`[s_server Worker] Received job: ${job.id}, Event: ${job.data.event}`);

    try {
        switch (job.data.event) {
            case 'admin_pong':
                // Déléguer au service AdminEventHandler
                await AdminEventHandler.handlePong(job);
                break;

            case 'request_scale_up':
                // Déléguer au service ScalingEventHandler
                await ScalingEventHandler.handleScaleUpRequest(job);
                break;

            case 'send_email':
                // Déléguer au service NotificationEventHandler
                await NotificationEventHandler.handleSendEmail(job);
                break;

            // --- Ajouter d'autres délégations ici ---
            // case 'new_order':
            //    await OrderEventHandler.handleNewOrder(job);
            //    break;

            default:
                console.warn(`[s_server Worker] Événement inconnu reçu: ${job.data.event} (Job ID: ${job.id})`);
        }
    } catch (error) {
        // Log l'erreur venant du handler, mais la relance pour que BullMQ la voie
        console.error(`[s_server Worker] Handler failed for job ${job.id} (event: ${job.data.event}). Error will be re-thrown.`, error);
        throw error; // ESSENTIEL pour que BullMQ gère l'échec/retry
    }
}

// Créer le Worker en utilisant la nouvelle fonction processJob
const worker = new Worker(
    queueName,
    processJob, // La fonction qui délègue
    {
        connection: connection,
        concurrency: 10
    }
);

worker.on('completed', (job) => {
    console.log(`[s_server Worker] Job ${job.id} (${job.data.event}) completed successfully by handler.`);
});

worker.on('failed', (job, err) => {
    // Log l'échec final après les tentatives éventuelles
    console.error(`[s_server Worker] Job ${job?.id} (${job?.data?.event}) ultimately failed after retries:`, err);
    // ENVISAGER: Envoyer une notification à un système de monitoring ici
});

worker.on('error', err => {
    console.error(`[s_server Worker] General worker error:`, err);
});

console.log(`[s_server Worker] Worker started and listening on queue ${queueName}.`);

// ... gestion shutdown ...
const shutdown = async () => {
    console.log(`[s_server Worker] Shutting down worker...`);
    await worker.close();
    await connection.quit();
    console.log(`[s_server Worker] Worker shut down.`);
    process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);