// s_server/app/jobs/service_event_worker.ts
//@ts-ignore
import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';

// Importer les nouveaux handlers
import AdminEventHandler from '#services/handlers/AdminEventHandler';
import ScalingEventHandler from '#services/handlers/ScalingEventHandler';
import NotificationEventHandler from '#services/handlers/NotificationEventHandler';
import PaymentEventHandler from '#services/payments/event_handler';
import logger from '@adonisjs/core/services/logger';
import { serverAction } from './worker_actions.js';
// import { isProd } from '../Utils/functions.js';

function StartWorker() {

     if(process.argv.join('').includes('/ace')) return

    // ... configuration connexion Redis ...
    const redisHost = process.env.REDIS_HOST || '127.0.0.1';
    const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);
    const queueName = 'service-to-server+s_server';
    //@ts-ignore
    const connection = new IORedis(redisPort, redisHost, { maxRetriesPerRequest: null });
    // ... gestion connexion ...

    /** 
     * Fonction principale de traitement des jobs, qui délègue aux services handlers.
     */
    async function processJob(job: Job<any>) {
        // Utiliser un logger avec contexte de job
        // const jobLogger = logger.child({ jobId: job.id, event: job.data.event });
        // jobLogger.info(`Received job`);
        const action = job.data.data.server_action;
        type keys = keyof typeof  serverAction;
        const isActionValid = (action:unknown): action is keys  => Object.keys(serverAction).includes(action as any)
        if(isActionValid(action)){
           await  serverAction[action](job.data)
        }
        
        try {
            switch (job.data.event) {
                case 'admin_pong':
                    await AdminEventHandler.handlePong(job);
                    break;

                case 'request_scale_up':
                    await ScalingEventHandler.handleScaleUpRequest(job);
                    break;

                case 'request_scale_down':
                    await ScalingEventHandler.handleScaleDownRequest(job);
                    break;

                case 'send_email':
                    await NotificationEventHandler.handleSendEmail(job);
                    break;

                case 'payment.intent.create':
                case 'payment.transaction.transfer':
                case 'payment.transaction.release':
                case 'payment.payout.create':
                    await PaymentEventHandler.handle({
                        event: job.data.event.replace('payment.', '') as any,
                        data: job.data.data
                    });
                    break;

                default:
                // jobLogger.warn(`Événement inconnu reçu`);
            }
            // jobLogger.info(`job.isCompleted = ${job.isCompleted()}`); // Log de succès après le switch

        } catch (error) {
            // Log l'erreur venant du handler AVANT de la relancer
            // jobLogger.error({ err: error }, `Handler failed. Error will be re-thrown.`);
            throw error; // ESSENTIEL pour que BullMQ gère l'échec/retry
        }
    }

    // Créer le Worker
    const worker = new Worker(queueName, processJob, { connection: connection, concurrency: 10 });

    worker.on('completed', (job:any) => {
        logger.info({ jobId: job.id, event: job.data.event }, `Job completed.`); // Logger succès final
    });

    worker.on('failed', (job:any, err:any) => {
        logger.error({ jobId: job?.id, event: job?.data?.event, err }, `Job ultimately failed after retries.`);
    });

    worker.on('error', (err:any) => {
        logger.error({ err }, `General worker error`);
    });

    logger.info(`[s_server Worker] Worker started and listening on queue ${queueName}.`);

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
}

StartWorker();