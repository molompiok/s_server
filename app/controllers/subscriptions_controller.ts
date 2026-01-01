// app/controllers/subscriptions_controller.ts

import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import Store from '#models/store'
import SubscriptionPlan from '#models/subscription_plan'
import StoreSubscription from '#models/store_subscription'
import AffiliateCode from '#models/affiliate_code'
import waveService from '#services/payments/wave'
import logger from '@adonisjs/core/services/logger'
import { DateTime } from 'luxon'
import env from '#start/env'
import subscriptionConfig from '#config/subscription'

export default class SubscriptionsController {
  /**
   * Validateur pour la souscription à un plan
   */
  static subscribeValidator = vine.compile(
    vine.object({
      plan_id: vine.string().trim(),
      duration: vine.enum(['1_month', '12_months']),
      affiliate_code: vine.string().trim().optional(),
    })
  )

  /**
   * GET /stores/:id/subscription
   * Récupérer l'abonnement actif d'un store
   */
  async show({ params, response, auth }: HttpContext) {
    try {
      const store = await Store.query()
        .where('id', params.id)
        .preload('user')
        .firstOrFail()

      // Vérifier que l'user est propriétaire du store
      if (store.user_id !== auth.user?.id) {
        return response.forbidden({ message: 'Accès interdit' })
      }

      // Récupérer l'abonnement actif
      const subscription = await StoreSubscription.query()
        .where('store_id', store.id)
        .where('status', 'active')
        .preload('plan')
        .orderBy('created_at', 'desc')
        .first()

      if (!subscription) {
        return response.ok({
          message: 'Aucun abonnement actif',
          subscription: null,
        })
      }

      return response.ok({
        subscription: {
          id: subscription.id,
          plan: subscription.plan,
          status: subscription.status,
          starts_at: subscription.starts_at,
          expires_at: subscription.expires_at,
          days_remaining: subscription.daysRemaining,
          is_active: subscription.isActive,
          affiliate_code: subscription.affiliate_code,
          amount_paid: subscription.amount_paid,
          duration_months: subscription.duration_months,
        },
      })
    } catch (error: any) {
      logger.error({ error: error.message, storeId: params.id }, 'Failed to fetch subscription')
      return response.internalServerError({ message: 'Erreur lors de la récupération de l\'abonnement' })
    }
  }

  /**
   * POST /stores/:id/subscribe
   * Souscrire à un plan d'abonnement
   */
  async subscribe({ params, request, response, auth }: HttpContext) {
    try {
      const payload = await request.validateUsing(SubscriptionsController.subscribeValidator)

      // 1. Récupérer le store
      const store = await Store.query()
        .where('id', params.id)
        .preload('user')
        .firstOrFail()

      // Vérifier que l'user est propriétaire
      if (store.user_id !== auth.user?.id) {
        return response.forbidden({ message: 'Accès interdit' })
      }

      // 2. Récupérer le plan
      const plan = await SubscriptionPlan.query()
        .where('id', payload.plan_id)
        .where('is_active', true)
        .firstOrFail()

      // 3. Vérifier si plan Free
      if (plan.id === 'free') {
        return response.badRequest({
          message: 'Le plan gratuit est attribué automatiquement. Choisissez un plan payant.',
        })
      }

      // 4. Vérifier s'il y a déjà un abonnement actif
      const existingSubscription = await StoreSubscription.query()
        .where('store_id', store.id)
        .where('status', 'active')
        .first()

      if (existingSubscription) {
        return response.badRequest({
          message: 'Vous avez déjà un abonnement actif. Annulez-le avant de souscrire à un nouveau plan.',
        })
      }

      // 5. Calculer le prix avec réductions
      const durationMonths = payload.duration === '12_months' ? 12 : 1
      const basePrice = plan.monthly_price * durationMonths

      // Réduction selon durée (depuis config)
      const reductionRate = subscriptionConfig.discountRates[payload.duration] || 0

      const priceAfterReduction = Math.round(basePrice * (1 - reductionRate))

      // 6. Gérer code d'affiliation
      let affiliateCommissionAmount = 0
      let affiliateWalletId: string | null = null
      let validatedAffiliateCode: string | null = null
      let affiliateUserId: string | null = null
      let affiliateExpiresAt: DateTime | null = null

      if (payload.affiliate_code) {
        const affiliateCode = await AffiliateCode.query()
          .where('code', payload.affiliate_code.toUpperCase())
          .where('is_active', true)
          .preload('owner')
          .first()

        if (affiliateCode) {
          // Vérifier que ce n'est pas son propre code
          if (affiliateCode.user_id === auth.user?.id) {
            logger.warn({ userId: auth.user.id }, 'User tried to use their own affiliate code')
          } else {
            // Code valide, calculer commission 20%
            affiliateCommissionAmount = Math.round(priceAfterReduction * subscriptionConfig.affiliateCommissionRate)
            affiliateWalletId = affiliateCode.owner.wave_main_wallet_id
            validatedAffiliateCode = affiliateCode.code
            affiliateUserId = affiliateCode.user_id
            // Relation d'affiliation active pendant 6 mois à partir de maintenant
            affiliateExpiresAt = DateTime.now().plus({ months: 6 })

            logger.info({
              storeId: store.id,
              affiliateCode: affiliateCode.code,
              affiliateUserId: affiliateUserId,
              commission: affiliateCommissionAmount,
              affiliateExpiresAt: affiliateExpiresAt.toISO(),
            }, 'Affiliate code applied')
          }
        } else {
          logger.warn({ code: payload.affiliate_code }, 'Invalid affiliate code provided')
        }
      }

      // 7. Calculer splits pour Wave
      const platformAmount = priceAfterReduction - affiliateCommissionAmount

      const splits: Array<{
        wallet_id: string
        amount: number
        category: string
        label: string
        release_delay_hours?: number
        allow_early_release?: boolean
      }> = [
        {
          wallet_id: env.get('WAVE_PLATFORM_WALLET_ID','wlt_undefined'), // Wallet PLATFORM de s_server
          amount: platformAmount,
          category: 'SUBSCRIPTION',
          label: `Abonnement ${plan.name} - ${durationMonths} mois`,
          release_delay_hours: 0, // Disponible immédiatement
        },
      ]

      // Ajouter split affiliation si code valide
      if (affiliateCommissionAmount > 0 && affiliateWalletId) {
        splits.push({
          wallet_id: affiliateWalletId,
          amount: affiliateCommissionAmount,
          category: 'COMMISSION',
          label: `Commission affiliation - ${validatedAffiliateCode}`,
          release_delay_hours: 0,
        })
      }

      // 8. Créer la souscription en statut pending
      const subscription = new StoreSubscription()
      subscription.store_id = store.id
      subscription.plan_id = plan.id
      subscription.status = 'pending'
      subscription.starts_at = DateTime.now()
      subscription.expires_at = DateTime.now().plus({ months: durationMonths })
      subscription.affiliate_code = validatedAffiliateCode
      subscription.affiliate_user_id = affiliateUserId
      subscription.affiliate_expires_at = affiliateExpiresAt
      subscription.amount_paid = priceAfterReduction
      subscription.duration_months = durationMonths
      subscription.metadata = {
        base_price: basePrice,
        reduction_rate: reductionRate,
        price_after_reduction: priceAfterReduction,
        affiliate_commission: affiliateCommissionAmount,
        platform_amount: platformAmount,
      }
      await subscription.save()

      // 9. Créer PaymentIntent via wave-api
      const paymentIntent = await waveService.createPaymentIntent({
        external_reference: subscription.id,
        amount: priceAfterReduction,
        currency: 'XOF',
        source_system: 'S_SERVER',
        success_url: `${env.get('APP_URL')}/subscriptions?payment=success&store_id=${store.id}&subscription_id=${subscription.id}`,
        error_url: `${env.get('APP_URL')}/subscriptions?payment=error&store_id=${store.id}&subscription_id=${subscription.id}`,
        splits,
      })

      // 10. Mettre à jour la subscription avec le payment_intent_id
      subscription.wave_payment_intent_id = paymentIntent.payment_intent_id
      await subscription.save()

      logger.info({
        storeId: store.id,
        planId: plan.id,
        subscriptionId: subscription.id,
        paymentIntentId: paymentIntent.payment_intent_id,
        amount: priceAfterReduction,
      }, 'Subscription created, awaiting payment')

      // 11. Vérifier le solde du wallet de l'utilisateur
      let userWalletBalance: number | null = null
      let canPayWithWallet = false

      if (store.user.wave_main_wallet_id) {
        try {
          const walletInfo = await waveService.getWalletBalance(store.user.wave_main_wallet_id)
          userWalletBalance = walletInfo.balance_available
          canPayWithWallet = userWalletBalance >= priceAfterReduction
        } catch (error: any) {
          logger.warn({ error: error.message, userId: store.user.id }, 'Failed to get wallet balance')
        }
      }

      // 12. Retourner les options de paiement
      return response.created({
        message: 'Abonnement créé avec succès. Veuillez effectuer le paiement.',
        data: {
          subscription_id: subscription.id,
          plan_name: plan.name,
          amount: priceAfterReduction,
          duration_months: durationMonths,
          expires_at: subscription.expires_at,
          affiliate_code_applied: !!validatedAffiliateCode,
          affiliate_commission: affiliateCommissionAmount,
          payment_options: {
            wave_checkout: {
              available: true,
              url: paymentIntent.wave_checkout_url,
              label: 'Payer avec Wave (Mobile Money, Carte)',
            },
            internal_wallet: {
              available: canPayWithWallet,
              balance: userWalletBalance,
              required: priceAfterReduction,
              label: canPayWithWallet
                ? 'Payer avec mon wallet'
                : `Solde insuffisant (${userWalletBalance} XOF / ${priceAfterReduction} XOF requis)`,
              pay_url: canPayWithWallet
                ? `/stores/${store.id}/subscribe/pay-with-wallet`
                : null,
            },
          },
        },
      })
    } catch (error: any) {
      logger.error({
        error: error.message,
        stack: error.stack,
        storeId: params.id,
      }, 'Subscription creation failed')

      if (error.code === 'E_ROW_NOT_FOUND') {
        return response.notFound({ message: 'Store ou plan non trouvé' })
      }

      return response.internalServerError({
        message: 'Erreur lors de la création de l\'abonnement',
        error: error.message,
      })
    }
  }

  /**
   * POST /stores/:id/subscribe/pay-with-wallet
   * Payer un abonnement en attente via le wallet interne
   */
  async payWithWallet({ params, response, auth }: HttpContext) {
    try {
      // 1. Récupérer le store
      const store = await Store.query()
        .where('id', params.id)
        .preload('user')
        .firstOrFail()

      // Vérifier que l'user est propriétaire
      if (store.user_id !== auth.user?.id) {
        return response.forbidden({ message: 'Accès interdit' })
      }

      // 2. Récupérer la souscription pending
      const subscription = await StoreSubscription.query()
        .where('store_id', store.id)
        .where('status', 'pending')
        .preload('plan')
        .orderBy('created_at', 'desc')
        .firstOrFail()

      if (!subscription.amount_paid) {
        return response.badRequest({ message: 'Montant de paiement invalide' })
      }

      // 3. Vérifier que l'utilisateur a un wallet
      if (!store.user.wave_main_wallet_id) {
        return response.badRequest({
          message: 'Vous n\'avez pas de wallet. Veuillez utiliser le paiement Wave.',
        })
      }

      // 4. Vérifier le solde disponible
      const walletInfo = await waveService.getWalletBalance(store.user.wave_main_wallet_id)

      if (walletInfo.balance_available < subscription.amount_paid) {
        return response.badRequest({
          message: `Solde insuffisant. Vous avez ${walletInfo.balance_available} XOF, ${subscription.amount_paid} XOF requis.`,
          data: {
            balance: walletInfo.balance_available,
            required: subscription.amount_paid,
            missing: subscription.amount_paid - walletInfo.balance_available,
          },
        })
      }

      // 5. Calculer les splits
      const metadata = subscription.metadata as any
      const affiliateCommission = metadata?.affiliate_commission || 0
      const platformAmount = subscription.amount_paid - affiliateCommission

      const platformWalletId = env.get('WAVE_PLATFORM_WALLET_ID', 'wlt_undefined')

      // 6. Effectuer le transfert vers la plateforme
      await waveService.internalTransfer({
        from_wallet_id: store.user.wave_main_wallet_id,
        to_wallet_id: platformWalletId,
        amount: platformAmount,
        label: `Abonnement ${subscription.plan?.name} - ${subscription.duration_months} mois`,
        category: 'SUBSCRIPTION',
        external_reference: subscription.id,
        source_system: 'S_SERVER',
      })

      // 7. Si commission affiliation, effectuer le transfert vers l'affilié
      if (affiliateCommission > 0 && subscription.affiliate_user_id) {
        const affiliateUser = await (await import('#models/user')).default.find(subscription.affiliate_user_id)

        if (affiliateUser?.wave_main_wallet_id) {
          await waveService.internalTransfer({
            from_wallet_id: store.user.wave_main_wallet_id,
            to_wallet_id: affiliateUser.wave_main_wallet_id,
            amount: affiliateCommission,
            label: `Commission affiliation - ${subscription.affiliate_code}`,
            category: 'COMMISSION',
            external_reference: subscription.id,
            source_system: 'S_SERVER',
          })

          logger.info({
            subscriptionId: subscription.id,
            affiliateUserId: affiliateUser.id,
            commission: affiliateCommission,
          }, 'Affiliate commission transferred')
        }
      }

      // 8. Activer la subscription
      subscription.status = 'active'
      await subscription.save()

      logger.info({
        storeId: store.id,
        subscriptionId: subscription.id,
        amount: subscription.amount_paid,
        paymentMethod: 'internal_wallet',
      }, 'Subscription activated via wallet payment')

      return response.ok({
        message: 'Abonnement activé avec succès !',
        data: {
          subscription_id: subscription.id,
          plan_name: subscription.plan?.name,
          status: subscription.status,
          starts_at: subscription.starts_at,
          expires_at: subscription.expires_at,
          amount_paid: subscription.amount_paid,
          new_balance: walletInfo.balance_available - subscription.amount_paid,
        },
      })
    } catch (error: any) {
      logger.error({
        error: error.message,
        stack: error.stack,
        storeId: params.id,
      }, 'Wallet payment failed')

      if (error.code === 'E_ROW_NOT_FOUND') {
        return response.notFound({ message: 'Aucun abonnement en attente de paiement' })
      }

      return response.internalServerError({
        message: 'Erreur lors du paiement par wallet',
        error: error.message,
      })
    }
  }

  /**
   * GET /stores/:id/subscription/plans ou GET /plans
   * Lister tous les plans disponibles
   */
  async listPlans({ response }: HttpContext) {
    try {
      const plans = await SubscriptionPlan.query()
        .where('is_active', true)
        .orderBy('sort_order', 'asc')

      return response.ok({
        plans: plans.map((plan) => ({
          id: plan.id,
          name: plan.name,
          slug: plan.id.replace('plan_', '').replace('_', '-'), // Générer slug depuis ID
          price_per_month: plan.monthly_price,
          commission: Number(plan.commission_rate), // Convertir en nombre
          features: plan.features,
          max_products: plan.max_products,
          max_categories: plan.max_categories,
          max_orders_per_month: null, // Pas de limite pour l'instant
          is_popular: plan.id === 'pro', // Marquer Pro comme populaire
          created_at: plan.createdAt.toISO(),
          updated_at: plan.updatedAt.toISO(),
        })),
      })
    } catch (error: any) {
      logger.error({ error: error.message, stack: error.stack }, 'Failed to list subscription plans')
      return response.internalServerError({ message: 'Erreur lors de la récupération des plans' })
    }
  }

  /**
   * DELETE /stores/:id/subscription
   * Annuler un abonnement actif
   */
  async cancel({ params, response, auth }: HttpContext) {
    try {
      const store = await Store.query()
        .where('id', params.id)
        .preload('user')
        .firstOrFail()

      if (store.user_id !== auth.user?.id) {
        return response.forbidden({ message: 'Accès interdit' })
      }

      const subscription = await StoreSubscription.query()
        .where('store_id', store.id)
        .where('status', 'active')
        .firstOrFail()

      subscription.status = 'cancelled'
      await subscription.save()

      logger.info({ storeId: store.id, subscriptionId: subscription.id }, 'Subscription cancelled')

      return response.ok({
        message: 'Abonnement annulé avec succès',
        subscription: {
          id: subscription.id,
          status: subscription.status,
        },
      })
    } catch (error: any) {
      logger.error({ error: error.message, storeId: params.id }, 'Failed to cancel subscription')

      if (error.code === 'E_ROW_NOT_FOUND') {
        return response.notFound({ message: 'Aucun abonnement actif trouvé' })
      }

      return response.internalServerError({ message: 'Erreur lors de l\'annulation' })
    }
  }

  /**
   * GET /stores/subscriptions
   * Récupérer tous les stores de l'utilisateur avec leur statut d'abonnement
   */
  async getMyStoresSubscriptions({ response, auth }: HttpContext) {
    try {
      // Récupérer tous les stores de l'utilisateur
      const stores = await Store.query()
        .where('user_id', auth.user!.id)
        .orderBy('created_at', 'desc')

      // Pour chaque store, récupérer son abonnement actif
      const storesWithSubscriptions = await Promise.all(
        stores.map(async (store) => {
          const subscription = await StoreSubscription.query()
            .where('store_id', store.id)
            .where('status', 'active')
            .preload('plan')
            .orderBy('created_at', 'desc')
            .first()

          return {
            store: {
              id: store.id,
              name: store.name,
              slug: store.slug,
              is_active: store.is_active,
              created_at: store.createdAt,
              updated_at: store.updatedAt,
            },
            subscription: subscription
              ? {
                  id: subscription.id,
                  store_id: subscription.store_id,
                  plan_id: subscription.plan_id,
                  starts_at: subscription.starts_at.toISO(),
                  expires_at: subscription.expires_at.toISO(),
                  amount_paid: subscription.amount_paid,
                  status: subscription.status,
                  // auto_renew: subscription.autoRenew,
                  metadata: subscription.metadata,
                  created_at: subscription.createdAt.toISO(),
                  updated_at: subscription.updatedAt.toISO(),
                  plan: subscription.plan
                    ? {
                        id: subscription.plan.id,
                        name: subscription.plan.name,
                        slug: subscription.plan.name.trim().replaceAll(' ','-').toLocaleLowerCase(),
                        price_per_month: subscription.plan.monthly_price,
                        commission: subscription.plan.commission_rate,
                        features: subscription.plan.features,
                        max_products: subscription.plan.max_products,
                        max_categories: subscription.plan.max_categories,
                        // max_orders_per_month: subscription.plan.maxOrdersPerMonth,
                        created_at: subscription.plan.createdAt.toISO(),
                        updated_at: subscription.plan.updatedAt.toISO(),
                      }
                    : undefined,
                }
              : null,
          }
        })
      )

      return response.ok({
        stores: storesWithSubscriptions,
      })
    } catch (error: any) {
      logger.error({ error: error.message, userId: auth.user?.id }, 'Failed to get stores subscriptions')
      return response.internalServerError({ message: 'Erreur lors de la récupération des abonnements' })
    }
  }
}
