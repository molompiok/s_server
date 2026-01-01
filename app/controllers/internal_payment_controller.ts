// app/controllers/internal_payment_controller.ts

import type { HttpContext } from '@adonisjs/core/http'
import PaymentEventHandler from '#services/payments/event_handler'
import logger from '@adonisjs/core/services/logger'
import env from '#start/env'


// NB : dans /home/opus/src/s_server/app/job/event_worker.ts  le PaymentEventHandler.handle peut aussi etre  appeler par un store. via BullMQ comme pour les emails.


/**
 * Controller pour gérer les événements de paiement depuis s_api
 * Authentification via INTERNAL_API_SECRET
 */
export default class InternalPaymentController {
  /**
   * POST /internal/payment/event
   * Reçoit un événement de paiement depuis s_api et le traite
   */
  async handleEvent({ request, response }: HttpContext) {
    try {
      // Vérifier l'authentification interne
      const authHeader = request.header('x-internal-secret')
      const expectedSecret = env.get('INTERNAL_API_SECRET')

      if (!authHeader || authHeader !== expectedSecret) {
        logger.warn({ ip: request.ip() }, 'Unauthorized internal payment event attempt')
        return response.unauthorized({ message: 'Unauthorized' })
      }

      // Récupérer les données de l'événement
      const eventData = request.body()

      logger.info(
        {
          event: eventData.event,
          source: request.header('x-source-system'),
        },
        'Received internal payment event'
      )

      // Traiter l'événement via le handler
      //@ts-ignore
      const result = await PaymentEventHandler.handle(eventData)

      return response.ok({
        message: 'Event processed successfully',
        data: result,
      })
    } catch (error: any) {
      logger.error(
        {
          error: error.message,
          stack: error.stack,
          body: request.body(),
        },
        'Internal payment event processing failed'
      )

      return response.internalServerError({
        message: 'Event processing failed',
        error: error.message,
      })
    }
  }
}
