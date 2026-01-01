// app/services/payments/sse_listener.ts
import env from '#start/env'
import logger from '@adonisjs/core/services/logger'
import StoreSubscription from '#models/store_subscription'
import redisService from '#services/RedisService'
import type { Redis as RedisClient } from 'ioredis'

/**
 * Service Transmit Listener - Écoute les événements de wave-api via Redis Pub/Sub
 * Transmit utilise Redis comme transport, donc on s'abonne directement aux channels Redis
 */
class WaveTransmitListener {
  private subscriber: RedisClient | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = 10
  private reconnectDelay = 5000 // 5 secondes
  private isConnected = false
  private managerId: string

  constructor() {
    this.managerId = env.get('WAVE_MANAGER_ID', '')
  }

  /**
   * Démarre l'écoute Redis Pub/Sub
   */
  async start() {
    if (this.isConnected) {
      logger.warn('Transmit Listener already connected')
      return
    }

    try {
      // Créer un client Redis dédié pour la subscription (duplication du client principal)
      this.subscriber = redisService.client.duplicate()

      // Le channel Transmit suit le pattern: transmit:{channel_name}
      // Les scopes manager:xxx deviennent des channels manager/xxx
      const channel = `transmit:manager/${this.managerId}`

      logger.info({ channel, managerId: this.managerId }, 'Starting Wave Transmit listener')

      // S'abonner au channel
      await this.subscriber.subscribe(channel)

      this.subscriber.on('subscribe', (subscribedChannel: string, count: number) => {
        this.isConnected = true
        this.reconnectAttempts = 0
        logger.info({ subscribedChannel, count }, '✅ Wave Transmit connected')
      })

      // Écouter les messages
      this.subscriber.on('message', (receivedChannel: string, message: string) => {
        this.handleMessage(receivedChannel, message)
      })

      this.subscriber.on('error', (error: any) => {
        logger.error({ error: error.message }, 'Redis Pub/Sub error')
        this.isConnected = false
        this.handleReconnect()
      })

    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to start Transmit listener')
      this.handleReconnect()
    }
  }

  /**
   * Gère les messages Redis reçus
   */
  private handleMessage(channel: string, message: string) {
    try {
      const data = JSON.parse(message)

      logger.debug({
        channel,
        type: data.type,
        eventType: data.eventType
      }, 'Received Transmit event')

      // Router les événements selon leur type
      if (data.type === 'payment.success' || data.eventType === 'payment.success') {
        this.handlePaymentSuccess(data)
      } else if (data.type === 'wallet.updated' || data.eventType === 'wallet.updated') {
        this.handleWalletUpdated(data)
      }

    } catch (error: any) {
      logger.error({ error: error.message, channel }, 'Failed to parse Transmit message')
    }
  }

  /**
   * Gère les événements de paiement réussi
   */
  private async handlePaymentSuccess(data: any) {
    try {
      logger.info({
        paymentIntentId: data.payload?.payment_intent_id,
        externalReference: data.payload?.external_reference,
      }, 'Payment success event received')

      // Vérifier si c'est un paiement d'abonnement
      const externalRef = data.payload?.external_reference

      if (!externalRef || !externalRef.startsWith('sub_')) {
        // Ce n'est pas un abonnement, ignorer
        return
      }

      // Récupérer la subscription
      const subscription = await StoreSubscription.query()
        .where('id', externalRef)
        .where('status', 'pending')
        .preload('store')
        .first()

      if (!subscription) {
        logger.warn({ externalRef }, 'Subscription not found or not pending')
        return
      }

      // Activer l'abonnement
      subscription.status = 'active'
      await subscription.save()

      logger.info({
        subscriptionId: subscription.id,
        storeId: subscription.store_id,
        planId: subscription.plan_id,
      }, 'Subscription activated')

      // Invalider le cache Redis du store pour forcer reload avec nouvelle subscription
      await redisService.deleteStoreCache(subscription.store)

      logger.info({ storeId: subscription.store_id }, 'Store cache invalidated after subscription activation')

    } catch (error: any) {
      logger.error({
        error: error.message,
        stack: error.stack,
      }, 'Failed to handle payment success event')
    }
  }

  /**
   * Gère les mises à jour de wallet
   */
  private async handleWalletUpdated(data: any) {
    try {
      logger.debug({
        walletId: data.payload?.id,
        balanceAvailable: data.payload?.balanceAvailable,
      }, 'Wallet updated event received')

      // Ici, tu peux ajouter une logique supplémentaire si nécessaire
      // Par exemple, notifier le frontend via websocket

    } catch (error: any) {
      logger.error({
        error: error.message,
      }, 'Failed to handle wallet updated event')
    }
  }

  /**
   * Gère la reconnexion automatique
   */
  private handleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('Max reconnect attempts reached. Stopping SSE listener.')
      this.stop()
      return
    }

    this.reconnectAttempts++

    const delay = this.reconnectDelay * this.reconnectAttempts

    logger.info({
      attempt: this.reconnectAttempts,
      delay,
    }, 'Attempting to reconnect SSE...')

    setTimeout(() => {
      this.start()
    }, delay)
  }

  /**
   * Arrête l'écoute Redis Pub/Sub
   */
  async stop() {
    if (this.subscriber) {
      await this.subscriber.unsubscribe()
      await this.subscriber.quit()
      this.subscriber = null
      this.isConnected = false
      logger.info('Wave Transmit listener stopped')
    }
  }

  /**
   * Vérifie si le listener est connecté
   */
  get connected(): boolean {
    return this.isConnected
  }
}

// Export singleton
export default new WaveTransmitListener()
