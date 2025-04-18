// s_server/app/services/MailService.ts
import edge from 'edge.js'
import mail from '@adonisjs/mail/services/main';
import env from '#start/env'; // Pour récupérer l'adresse d'expédition par défaut
import logger from '@adonisjs/core/services/logger'; // Utiliser le logger Adonis

// Interface pour les options d'envoi, pour plus de clarté
interface SendMailOptions {
    to: string;
    subject: string;
    /** Le contenu texte simple de l'email. */
    text?: string;
    /** Le contenu HTML de l'email. Si fourni, il est prioritaire sur 'text'. */
    html?: string;
    /** Le chemin vers le template Edge (ex: 'emails/welcome'). Si fourni, il est prioritaire sur 'html' et 'text'. */
    template?: string;
    /** Les données à passer au template Edge. */
    context?: Record<string, any>;
    // On pourrait ajouter plus tard : from, cc, bcc, attachments...
}

class MailService {
    private mailFromAddress: string;
    private mailFromName: string;

    constructor() {
        // Récupérer les valeurs par défaut depuis l'environnement
        this.mailFromAddress = env.get('MAIL_FROM_ADDRESS', 'noreply@sublymus.com'); // Remplace par ton défaut
        this.mailFromName = env.get('MAIL_FROM_NAME', 'Sublymus Platform');     // Remplace par ton défaut

        if (!this.mailFromAddress || !this.mailFromName) {
            logger.warn('MAIL_FROM_ADDRESS ou MAIL_FROM_NAME non définis dans .env. Utilisation de valeurs par défaut génériques.');
            // Tu pourrais choisir de lancer une erreur ici si c'est critique
        }
    }

    /**
     * Envoie un email en utilisant la configuration d'@adonisjs/mail.
     * Gère le rendu de template Edge si spécifié.
     *
     * @param options Les options de l'email à envoyer.
     * @throws Error si l'envoi échoue ou si le template ne peut être rendu.
     */
    async send(options: SendMailOptions): Promise<void> {
        const { to, subject, text, html, template, context } = options;

        logger.info({ mailTo: to, subject }, `Tentative d'envoi d'email...`);

        // Valider qu'on a au moins un contenu
        if (!text && !html && !template) {
            logger.error({ mailOptions: options }, 'Échec de l\'envoi d\'email: Aucun contenu (text, html ou template) fourni.');
            throw new Error('Impossible d\'envoyer un email sans contenu (text, html ou template).');
        }

        try {
            await mail.send(async (message) => {
                message
                    .to(to)
                    .from(this.mailFromAddress, this.mailFromName)
                    .subject(subject);

                // Gérer le contenu prioritairement : template > html > text
                if (template) {
                    // Rendre le template Edge
                    logger.debug({ template, context }, 'Rendu du template Edge pour l\'email');
                    try {
                        // Assure-toi que le service 'edge' est correctement configuré
                        const renderedHtml = await edge.render(template, context || {});
                        message.html(renderedHtml);
                        // Optionnel: Générer une version texte à partir du HTML ou d'un template texte séparé ?
                        // message.text(...)
                    } catch (renderError) {
                        logger.error({ template, context, error: renderError }, 'Erreur lors du rendu du template Edge');
                        // Relance l'erreur pour la capturer dans le catch externe
                        throw new Error(`Erreur rendu template ${template}: ${renderError.message}`);
                    }
                } else if (html) {
                    message.html(html);
                    // Optionnel: Générer une version texte à partir du HTML ?
                    // message.text(...)
                } else if (text) {
                    // S'assurer que 'text' n'est pas undefined ici (normalement garanti par la vérif initiale)
                    message.text(text!);
                }
            });

            logger.info({ mailTo: to, subject }, 'Email envoyé avec succès.');

        } catch (error) {
            logger.error({ mailTo: to, subject, error: error.message }, 'Échec de l\'envoi de l\'email');
            // Relancer l'erreur pour que l'appelant (ex: le worker BullMQ) soit informé
            throw error;
        }
    }

    // Tu pourrais ajouter d'autres méthodes pratiques ici, par exemple :
    // async sendPasswordResetEmail(user: User, resetToken: string) { ... }
    // async sendOrderConfirmationEmail(order: Order) { ... }
}

// Exporte une instance unique (Singleton)
export default new MailService();