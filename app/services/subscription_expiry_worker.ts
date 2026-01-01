// app/services/subscription_expiry_worker.ts
import StoreSubscription from '#models/store_subscription'
import redisService from '#services/RedisService'
import logger from '@adonisjs/core/services/logger'
import { DateTime } from 'luxon'
// @ts-ignore
import { Queue, Worker } from 'bullmq'
import Store from '#models/store'
// import User from '#models/user'
import mailService from '#services/MailService'
import env from '#start/env'
import { isProd, devIp } from '../Utils/functions.js'
import subscriptionConfig from '#config/subscription'

/**
 * Worker qui vérifie les abonnements expirés
 * À exécuter quotidiennement via cron ou scheduler
 */
class SubscriptionExpiryWorker {
  /**
   * Vérifie et met à jour les abonnements expirés
   */
  async run() {
    logger.info('Starting subscription expiry check...')

    try {
      // Récupérer tous les abonnements actifs qui ont expiré
      const expiredSubscriptions = await StoreSubscription.query()
        .where('status', 'active')
        .where('expires_at', '<=', DateTime.now().toSQL())
        .preload('store')

      if (expiredSubscriptions.length === 0) {
        logger.info('No expired subscriptions found')
        return
      }

      logger.info({ count: expiredSubscriptions.length }, 'Found expired subscriptions')

      for (const subscription of expiredSubscriptions) {
        try {
          // Mettre à jour le statut
          subscription.status = 'expired'
          await subscription.save()

          // Invalider le cache Redis du store
          await redisService.deleteStoreCache(subscription.store)

          logger.info({
            subscriptionId: subscription.id,
            storeId: subscription.store_id,
            planId: subscription.plan_id,
            expiredAt: subscription.expires_at.toISO(),
          }, 'Subscription expired and cache invalidated')

          // TODO: Envoyer notification email au propriétaire du store
          // await sendExpirationEmail(subscription.store.user_id)

        } catch (error: any) {
          logger.error({
            subscriptionId: subscription.id,
            error: error.message,
          }, 'Failed to process expired subscription')
        }
      }

      logger.info({ processed: expiredSubscriptions.length }, 'Subscription expiry check completed')
    } catch (error: any) {
      logger.error({
        error: error.message,
        stack: error.stack,
      }, 'Subscription expiry worker failed')
    }
  }

  /**
   * Vérifie les abonnements qui vont expirer bientôt
   * Envoie emails à 7j, 3j et 1j avant expiration
   */
  async checkUpcomingExpirations() {
    logger.info('Checking upcoming subscription expirations...')

    try {
      // Récupérer subscriptions actives expirant dans les 7 prochains jours
      const sevenDaysFromNow = DateTime.now().plus({ days: 7 })

      const upcomingExpirations = await StoreSubscription.query()
        .where('status', 'active')
        .whereBetween('expires_at', [
          DateTime.now().toSQL(),
          sevenDaysFromNow.toSQL(),
        ])
        .preload('store', (query) => query.preload('user'))
        .preload('plan')

      if (upcomingExpirations.length === 0) {
        logger.info('No upcoming expirations found')
        return
      }

      logger.info({ count: upcomingExpirations.length }, 'Found upcoming expirations')

      for (const subscription of upcomingExpirations) {
        try {
          const daysRemaining = subscription.daysRemaining
          const user = subscription.store.user

          if (!user || !user.email) {
            logger.warn({ subscriptionId: subscription.id }, 'No user email found, skipping')
            continue
          }

          // Initialiser metadata si null
          const metadata = subscription.metadata || {}
          const emailsSent = metadata.reminder_emails_sent || {}

          // Déterminer quel email envoyer
          let shouldSend = false
          let template = ''
          let emailKey = ''

          if (daysRemaining === 7 && !emailsSent['7days']) {
            shouldSend = true
            template = 'emails/subscription_expiry_7days'
            emailKey = '7days'
          } else if (daysRemaining === 3 && !emailsSent['3days']) {
            shouldSend = true
            template = 'emails/subscription_expiry_3days'
            emailKey = '3days'
          } else if (daysRemaining === 1 && !emailsSent['1day']) {
            shouldSend = true
            template = 'emails/subscription_expiry_1day'
            emailKey = '1day'
          }

          if (shouldSend) {
            // Envoyer l'email
            await mailService.send({
              to: user.email,
              subject: `Rappel : Votre abonnement ${subscription.plan.name} expire dans ${daysRemaining} jour(s)`,
              template,
              context: {
                userName: user.full_name || user.email.split('@')[0],
                storeName: subscription.store.name,
                planName: subscription.plan.name,
                expiryDate: subscription.expires_at.toFormat('dd MMMM yyyy', { locale: 'fr' }),
                daysRemaining,
                commissionRate: (subscription.plan.commission_rate * 100).toFixed(0), // Ex: "10"
                renewUrl: `${env.get('APP_URL')}/stores/${subscription.store.id}/subscription`,
              },
            })

            // Marquer l'email comme envoyé dans metadata
            emailsSent[emailKey] = DateTime.now().toISO()
            subscription.metadata = {
              ...metadata,
              reminder_emails_sent: emailsSent,
            }
            await subscription.save()

            logger.info({
              subscriptionId: subscription.id,
              userEmail: user.email,
              daysRemaining,
              template,
            }, 'Expiration reminder email sent')
          }
        } catch (error: any) {
          logger.error({
            subscriptionId: subscription.id,
            error: error.message,
          }, 'Failed to send expiration reminder')
        }
      }

      logger.info('Expiration reminders check completed')
    } catch (error: any) {
      logger.error({
        error: error.message,
        stack: error.stack,
      }, 'Upcoming expirations check failed')
    }
  }

  /**
   * Renouvellement automatique des abonnements payants
   * Prélève depuis le wallet du store pour renouveler l'abonnement
   */
  async autoRenewSubscriptions() {
    logger.info('Starting automatic subscription renewal...')

    try {
      // Récupérer les abonnements actifs qui expirent aujourd'hui ou dans les prochaines 24h
      const tomorrow = DateTime.now().plus({ days: 1 })

      const expiringSubscriptions = await StoreSubscription.query()
        .where('status', 'active')
        .whereBetween('expires_at', [DateTime.now().toSQL(), tomorrow.toSQL()])
        .whereNot('plan_id', 'free') // Exclure le plan Free
        .preload('store', (query) => query.preload('user'))
        .preload('plan')

      if (expiringSubscriptions.length === 0) {
        logger.info('No subscriptions to auto-renew')
        return
      }

      logger.info({ count: expiringSubscriptions.length }, 'Found subscriptions to auto-renew')

      for (const subscription of expiringSubscriptions) {
        try {
          const store = subscription.store
          const plan = subscription.plan
          const user = store.user

          // Vérifier si le store a un wallet_id
          if (!store.wave_store_wallet_id) {
            logger.warn({ subscriptionId: subscription.id, storeId: store.id }, 'Store has no wallet_id, skipping auto-renewal')
            continue
          }

          // Calculer le prix du renouvellement (même durée que l'abonnement original)
          const durationMonths = subscription.duration_months || 1
          const basePrice = plan.monthly_price * durationMonths

          // Appliquer la même réduction que l'abonnement original (depuis config)
          const duration = durationMonths === 12 ? '12_months' : '1_month'
          const reductionRate = subscriptionConfig.discountRates[duration] || 0
          const priceAfterReduction = Math.round(basePrice * (1 - reductionRate))

          // IMPORTANT: Commission d'affiliation payée UNE SEULE FOIS lors de la souscription initiale
          // Les renouvellements automatiques NE VERSENT PAS de commission, même si la relation est active
          // const affiliateCode = subscription.affiliate_code
          // const affiliateCommissionAmount = 0 // Toujours 0 pour les renouvellements
          const platformAmount = priceAfterReduction // 100% vers plateforme

          // Préparer les splits pour l'internal payment intent
          // Seul le montant plateforme (pas de commission affiliation sur renouvellements)
          const splits: any[] = [
            {
              wallet_id: env.get('WAVE_PLATFORM_WALLET_ID'),
              amount: platformAmount,
              category: 'SUBSCRIPTION',
              label: `Renouvellement ${plan.name} - ${durationMonths} mois`,
              release_delay_hours: 0,
            },
          ]

          // Appeler wave-api pour créer l'internal payment intent
          const waveApiUrl = isProd
            ? env.get('WAVE_API_URL', 'https://wallet.sublymus.com')
            : `http://${devIp}:${env.get('WAVE_API_PORT', '3333')}`

          const managerId = env.get('WAVE_MANAGER_ID') || ''
          const response = await fetch(`${waveApiUrl}/v1/transactions/internal-intent`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Manager-Id': managerId,
            },
            body: JSON.stringify({
              payer_wallet_id: store.wave_store_wallet_id,
              amount: priceAfterReduction,
              currency: 'XOF',
              external_reference: `renewal_${subscription.id}_${DateTime.now().toUnixInteger()}`,
              source_system: 's_server',
              description: `Renouvellement automatique - ${plan.name}`,
              metadata: {
                subscription_id: subscription.id,
                store_id: store.id,
                plan_id: plan.id,
                auto_renewal: true,
              },
              splits,
            }),
          })

          const result = (await response.json()) as {
            data?: { status: string; internal_intent_id: string }
            message?: string
          }

          if (response.ok && result.data?.status === 'COMPLETED') {
            // Renouveler la subscription
            subscription.starts_at = subscription.expires_at // Nouveau départ = ancienne expiration
            subscription.expires_at = subscription.expires_at.plus({ months: durationMonths })
            subscription.amount_paid = priceAfterReduction
            subscription.metadata = {
              ...subscription.metadata,
              auto_renewed: true,
              renewed_at: DateTime.now().toISO(),
              internal_intent_id: result.data?.internal_intent_id,
            }
            await subscription.save()

            // Invalider cache Redis
            await redisService.deleteStoreCache(store)

            logger.info({
              subscriptionId: subscription.id,
              storeId: store.id,
              amount: priceAfterReduction,
              newExpiryDate: subscription.expires_at.toISO(),
            }, 'Subscription auto-renewed successfully')

            // Envoyer email de confirmation
            if (user && user.email) {
              await mailService.send({
                to: user.email,
                subject: `Abonnement ${plan.name} renouvelé automatiquement`,
                template: 'emails/subscription_renewed',
                context: {
                  userName: user.full_name || user.email.split('@')[0],
                  storeName: store.name,
                  planName: plan.name,
                  amount: priceAfterReduction,
                  newExpiryDate: subscription.expires_at.toFormat('dd MMMM yyyy', { locale: 'fr' }),
                  durationMonths,
                },
              })
            }
          } else {
            // Échec du paiement (solde insuffisant ou autre erreur)
            logger.warn({
              subscriptionId: subscription.id,
              storeId: store.id,
              error: result.message || 'Payment failed',
            }, 'Auto-renewal payment failed')

            // Envoyer email d'échec si l'utilisateur existe
            if (user && user.email) {
              await mailService.send({
                to: user.email,
                subject: `Échec du renouvellement automatique - ${plan.name}`,
                template: 'emails/subscription_renewal_failed',
                context: {
                  userName: user.full_name || user.email.split('@')[0],
                  storeName: store.name,
                  planName: plan.name,
                  amount: priceAfterReduction,
                  error: result.message || 'Solde insuffisant',
                  renewUrl: `${env.get('APP_URL')}/stores/${store.id}/subscription`,
                },
              })
            }

            // La subscription expirera naturellement dans le worker run()
          }
        } catch (error: any) {
          logger.error({
            subscriptionId: subscription.id,
            error: error.message,
          }, 'Failed to auto-renew subscription')
        }
      }

      logger.info('Auto-renewal check completed')
    } catch (error: any) {
      logger.error({
        error: error.message,
        stack: error.stack,
      }, 'Auto-renewal process failed')
    }
  }

  /**
   * Attribuer le plan Free aux stores sans abonnement actif
   */
  async assignFreePlanToInactiveStores() {
    logger.info('Checking stores without active subscriptions...')

    try {
      // Récupérer tous les stores
      const allStores = await Store.query().select('id')

      // Récupérer les store_ids avec abonnements actifs
      const storesWithActiveSubscriptions = await StoreSubscription.query()
        .where('status', 'active')
        .select('store_id')
        .groupBy('store_id')

      const activeStoreIds = storesWithActiveSubscriptions.map((sub) => sub.store_id)

      // Stores sans abonnement actif
      const storesWithoutSubscription = allStores.filter(
        (store) => !activeStoreIds.includes(store.id)
      )

      if (storesWithoutSubscription.length === 0) {
        logger.info('All stores have active subscriptions')
        return
      }

      logger.info({ count: storesWithoutSubscription.length }, 'Found stores without active subscriptions')

      for (const store of storesWithoutSubscription) {
        try {
          // Vérifier s'il n'y a vraiment aucun abonnement (même expiré)
          const existingSubscription = await StoreSubscription.query()
            .where('store_id', store.id)
            .first()

          if (existingSubscription) {
            // Il y a un abonnement mais inactif, on ne fait rien
            continue
          }

          // Créer un abonnement Free
          // Note : expires_at = +1 mois mais renouvelé automatiquement
          const freeSubscription = new StoreSubscription()
          freeSubscription.store_id = store.id
          freeSubscription.plan_id = 'free'
          freeSubscription.status = 'active'
          freeSubscription.starts_at = DateTime.now()
          freeSubscription.expires_at = DateTime.now().plus({ months: 1 }) // Renouvellement automatique
          freeSubscription.wave_payment_intent_id = null
          freeSubscription.affiliate_code = null
          freeSubscription.amount_paid = null
          freeSubscription.duration_months = 1
          freeSubscription.metadata = { auto_renew_free: true } // Flag pour renouvellement auto
          await freeSubscription.save()

          // Invalider cache
          const fullStore = await Store.find(store.id)
          if (fullStore) {
            await redisService.deleteStoreCache(fullStore)
          }

          logger.info({ storeId: store.id }, 'Free plan assigned to store without subscription')
        } catch (error: any) {
          logger.error({
            storeId: store.id,
            error: error.message,
          }, 'Failed to assign free plan')
        }
      }

      logger.info({ assigned: storesWithoutSubscription.length }, 'Free plan assignment completed')
    } catch (error: any) {
      logger.error({
        error: error.message,
        stack: error.stack,
      }, 'Free plan assignment failed')
    }
  }
}

export default new SubscriptionExpiryWorker()
