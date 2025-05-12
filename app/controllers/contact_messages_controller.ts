// app/Http/Controllers/ContactMessagesController.ts
import type { HttpContext } from '@adonisjs/core/http'
import ContactMessage from '#models/ContactMessage'
import vine from '@vinejs/vine'
import MailService from '#services/MailService'
import logger from '@adonisjs/core/services/logger'
// import emitter from '@adonisjs/core/services/emitter' // Pour les SSE

export default class ContactMessagesController {
  contactMessageValidator = vine.compile(
    vine.object({
      name: vine.string().trim().minLength(2).maxLength(100),
      email: vine.string().trim().email(),
      subject: vine.string().trim().minLength(3).maxLength(200),
      message: vine.string().trim().minLength(10).maxLength(5000),
      // consent: vine.boolean().accepted() // Si tu ajoutes la case RGPD
    })
  )
  async store({ request, response, /* auth */ }: HttpContext) {
    // Valider les données de la requête
    // Tu devras créer ce validateur (voir ci-dessous)
    const payload = await request.validateUsing(this.contactMessageValidator)

    try {
      const contactMessage = await ContactMessage.create({
        name: payload.name,
        email: payload.email,
        subject: payload.subject,
        message: payload.message,
        status: 'new', // Statut initial
      })

      try {
        // Appeler MailService.send pour envoyer une confirmation à l'utilisateur
        await MailService.send({
          to: payload.email, // L'email de l'utilisateur qui a contacté
          subject: `Nous avons bien reçu votre message : "${payload.subject}"`, // Sujet dynamique
          template: 'emails/we_receive_contact_message', // Ton template Edge
          context: {
            userName: payload.name,               // Nom de l'utilisateur
            userSubject: payload.subject,         // Le sujet original de son message
            siteName: "Sublymus",                 // Nom de ton site/plateforme
            supportEmail: "support@sublymus.com", // Ton email de support (ou contact@)
            // Tu peux ajouter d'autres variables si besoin dans ton template
            // Par exemple, une référence au message si tu veux la stocker et l'afficher
            // messageReference: newlyCreatedContactMessage.id // Si tu as l'ID du message sauvegardé
          }
        });

        logger.info(`[ContactMessagesController] Email de confirmation envoyé à: ${payload.email} pour le sujet: "${payload.subject}"`);

      } catch (error) {
        logger.error({ email: payload.email, error: error.message, subject: payload.subject }, `[ContactMessagesController] Erreur lors de l'envoi de l'email de confirmation de contact`);
        // Ne pas bloquer la réponse à l'utilisateur si l'email de confirmation échoue,
        // mais logger l'erreur est important.
      }


      return response.created({
        message: 'Votre message a été envoyé avec succès. Nous vous répondrons dès que possible.',
        data: {
          id: contactMessage.id,
          // Tu peux choisir de retourner le message complet ou juste un ID/message de succès
        },
      })
    } catch (error) {
      console.error('Error storing contact message:', error)
      return response.internalServerError({
        message: 'Une erreur est survenue lors de l_envoi de votre message. Veuillez réessayer.',
        error: error.message,
      })
    }
  }

  /**
   * Display a list of contact messages.
   * (Pour un usage admin potentiellement)
   */
  async index({ response, request }: HttpContext) {
    // Authentification et autorisation admin requises ici
    // exemple: await auth.authenticate(); if (auth.user.role !== 'admin') return response.unauthorized();

    const page = request.input('page', 1)
    const limit = request.input('limit', 10)
    const status = request.input('status')
    const orderBy = request.input('order_by', 'created_at')
    const orderDirection = request.input('order_direction', 'desc')

    const query = ContactMessage.query().orderBy(orderBy, orderDirection)

    if (status) {
      query.where('status', status)
    }

    const messages = await query.paginate(page, limit)

    return response.ok(messages)
  }

  /**
   * Show a single contact message.
   * (Pour un usage admin potentiellement)
   */
  async show({ params, response /*, auth*/ }: HttpContext) {
    // Authentification et autorisation admin requises
    try {
      const message = await ContactMessage.findOrFail(params.id)
      // Optionnel: Marquer comme 'read' si l'admin le consulte
      // if (message.status === 'new' /* && isAdminViewing */) {
      //   message.status = 'read'
      //   await message.save()
      // }
      return response.ok(message)
    } catch (error) {
      return response.notFound({ message: 'Message non trouvé.' })
    }
  }

  /**
   * Update a contact message's status (e.g., 'replied', 'archived').
   * (Pour un usage admin potentiellement)
   */
  async update({ params, request, response /*, auth*/ }: HttpContext) {
    // Authentification et autorisation admin requises
    // Valider le nouveau statut
    const newStatus = request.input('status')
    if (!['read', 'replied', 'archived'].includes(newStatus)) {
      return response.badRequest({ message: 'Statut invalide.' })
    }

    try {
      const message = await ContactMessage.findOrFail(params.id)
      message.status = newStatus as 'read' | 'replied' | 'archived'
      await message.save()
      return response.ok({ message: 'Statut du message mis à jour.', data: message })
    } catch (error) {
      return response.notFound({ message: 'Message non trouvé.' })
    }
  }

  /**
   * Delete a contact message.
   * (Pour un usage admin potentiellement)
   */
  async destroy({ params, response /*, auth*/ }: HttpContext) {
    // Authentification et autorisation admin requises
    try {
      const message = await ContactMessage.findOrFail(params.id)
      await message.delete()
      return response.noContent()
    } catch (error) {
      return response.notFound({ message: 'Message non trouvé.' })
    }
  }
}