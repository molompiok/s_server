// s_server/app/services/event_handlers/AdminEventHandler.ts
// @ts-ignore
import type { Job } from 'bullmq';

export class AdminEventHandler {
    async handlePong(job: Job<{ event: string, data: { storeId: string, timestamp: number } }>) {
        const pongData = job.data.data;
        console.log(`[AdminEventHandler] ===> PONG reçu du Store ${pongData.storeId}! (Timestamp: ${pongData.timestamp}, Job ID: ${job.id})`);
        // Logique supplémentaire si nécessaire
    }
}
export default new AdminEventHandler();