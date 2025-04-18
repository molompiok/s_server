// s_server/app/controllers/try_service_controller.ts

import type { HttpContext } from '@adonisjs/core/http'
import MailService from '#services/MailService' // Importer notre service
import logger from '@adonisjs/core/services/logger' // Pour logger les erreurs

export default class TryServiceController {

    /**
     * Teste l'envoi d'un email via MailService.
     * Prend l'email destinataire en paramètre query ?to=...
     */
    async testEmail({ request, response }: HttpContext) {
        const recipientEmail = request.input('to') // Récupère l'email depuis ?to=...

        if (!recipientEmail) {
            return response.badRequest({ message: 'Paramètre query "to" (email destinataire) manquant.' })
        }

        // Vérification simple du format email (peut être améliorée)
        if (!/\S+@\S+\.\S+/.test(recipientEmail)) {
             return response.badRequest({ message: `Format d'email invalide: ${recipientEmail}` })
        }

        logger.info(`[TryServiceController] Début du test d'envoi d'email à: ${recipientEmail}`);

        try {
            // Appeler MailService.send avec des données de test
            await MailService.send({
                to: recipientEmail,
                subject: 'Email de Test Sublymus [s_server]',
                // --- Choisis UNE des options de contenu suivantes ---

                // Option 1: Texte simple
                // text: `Ceci est un email de test envoyé depuis s_server pour ${recipientEmail}.\nTimestamp: ${new Date().toISOString()}`,

                // Option 2: HTML simple
                // html: `<p>Ceci est un email de <b>test HTML</b> envoyé depuis s_server pour ${recipientEmail}.</p><p>Timestamp: ${new Date().toISOString()}</p>`,

                // Option 3: Template Edge (si tu as créé 'emails/welcome.edge')
                 template: 'emails/welcome', // Chemin relatif depuis 'resources/views/'
                 context: {
                     userName: 'Testeur Sublymus',
                     storeId: 'test-store-123',
                     // 'subject' est passé automatiquement par MailService si besoin dans le template
                 }

                // ------------------------------------------------------
            });

            logger.info(`[TryServiceController] MailService.send a terminé pour: ${recipientEmail}`);
            return response.ok({ message: `Tentative d'envoi d'email à ${recipientEmail} effectuée. Vérifiez la boîte de réception.` });

        } catch (error) {
            logger.error({ email: recipientEmail, error: error.message }, `[TryServiceController] Erreur lors de l'envoi de l'email de test`);
            // Ne pas exposer l'erreur détaillée au client
            return response.internalServerError({ message: 'Échec de l\'envoi de l\'email. Vérifiez les logs serveur.' });
        }
    }
}