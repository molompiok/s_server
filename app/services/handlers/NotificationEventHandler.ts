// s_server/app/services/event_handlers/NotificationEventHandler.ts
import type { Job } from 'bullmq';
import MailService from '#services/MailService'; // Importer le service qu'on vient de créer
import logger from '@adonisjs/core/services/logger'; // Utiliser le logger

export class NotificationEventHandler {

    async handleSendEmail(job: Job<{ event: string, data: { to: string, subject: string, text?: string, html?: string, template?: string, context?: any } }>) {
        const emailData = job.data.data;
        logger.info({ jobId: job.id, emailTo: emailData.to }, `[NotificationEventHandler] Processing 'send_email' request`);

        try {
            // Appeler directement la méthode send de notre service
            await MailService.send({
                to: emailData.to,
                subject: emailData.subject,
                text: emailData.text, // Passer les options telles quelles
                html: emailData.html,
                template: emailData.template,
                context: emailData.context
            });
            // Le succès est déjà logué dans MailService, pas besoin de le reloguer ici.
        } catch (error) {
            logger.error({ jobId: job.id, emailTo: emailData.to, error: error.message }, `[NotificationEventHandler] Failed to send email via MailService`);
            // Relancer l'erreur pour que BullMQ la gère (retry ou marque comme failed)
            // Attention : Évaluer si un retry est souhaitable pour les emails !
            throw error;
        }
    }
}

export default new NotificationEventHandler();