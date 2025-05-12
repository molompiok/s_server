// app/Http/Controllers/PreinscriptionsController.ts
import type { HttpContext } from '@adonisjs/core/http'
import Preinscription, { PreinscriptionPaymentMethod, PreinscriptionPaymentStatus, PreinscriptionTier } from '#models/Preinscription'
import vine from '@vinejs/vine'
import MailService from '#services/MailService'
import logger from '@adonisjs/core/services/logger'
import User from '#models/user'
import { v4 } from 'uuid'
export default class PreinscriptionsController {
  preinscriptionStoreValidator = vine.compile(
  vine.object({
    name: vine.string().trim().minLength(2).maxLength(100),
    email: vine.string().trim().email(),
    shop_name: vine.string().trim().maxLength(150).optional(),
    chosen_tier: vine.enum(['bronze', 'silver', 'gold', 'custom'] as PreinscriptionTier[]),
    contribution_amount: vine.number().min(1000), // Montant minimum (ex: 1000 FCFA), à ajuster
    display_info: vine.boolean(),
    payment_method: vine.enum(['mtn', 'orange', 'moov', 'wave', 'visa', 'other'] as PreinscriptionPaymentMethod[]),
    transaction_details: vine.object({}).allowUnknownProperties().optional(), // Accepte tout objet pour les détails
    // user_id: vine.string().exists({ table: 'users', column: 'id' }).optional(), // Si tu lies à un user
    // create_account_if_not_exists: vine.boolean().optional(), // Si tu ajoutes cette logique
  })
)

preinscriptionValidatePaymentValidator = vine.compile(
  vine.object({
    status: vine.enum(['confirmed', 'failed', 'cancelled'] as Exclude<PreinscriptionPaymentStatus, 'pending'>[]), // On ne peut pas valider vers 'pending'
    admin_notes: vine.string().trim().maxLength(1000).optional(),
  })
)
  /**
   * Store a new preinscription.
   */
  async store({ request, response /*, auth */ }: HttpContext) {
    console.log(request.body());
    const payload = await request.validateUsing(this.preinscriptionStoreValidator)

    // Optionnel: Vérifier si l'email est déjà préinscrit pour éviter les doublons,
    // ou si un utilisateur avec cet email existe déjà et le lier.
    // const existingPreinscription = await Preinscription.findBy('email', payload.email)
    // if (existingPreinscription) {
    //   return response.conflict({
    //     message: 'Cet e-mail a déjà été utilisé pour une préinscription.',
    //     // Tu pourrais retourner les détails de la préinscription existante si pertinent
    //   })
    // }


    try {
      const preinscription = await Preinscription.create({
        name: payload.name,
        email: payload.email,
        shop_name: payload.shop_name,
        chosen_tier: payload.chosen_tier,
        contribution_amount: payload.contribution_amount, // Assure-toi que le montant correspond bien au tier si pas 'custom'
        display_info: payload.display_info,
        payment_method: payload.payment_method,
        transaction_details: payload.transaction_details || {},
        payment_status: 'pending', // Statut initial
        // userId: userId, // Si tu gères la liaison utilisateur
      })


      // TODO: Envoyer une notification à l'admin (SSE ou email)
      // emitter.emit('admin:new_preinscription', { preinscriptionId: preinscription.id, tier: preinscription.chosenTier })

      return response.created({
        message: 'Votre préinscription a été enregistrée avec succès ! Un e-mail de confirmation vous sera envoyé.',
        data: {
          id: preinscription.id,
          // Tu peux choisir de retourner des infos spécifiques ou la préinscription complète
        },
      })
    } catch (error) {
      console.error('Error storing preinscription:', error)
      return response.internalServerError({
        message: "Une erreur est survenue lors de l'enregistrement de votre préinscription.",
        error: error.message,
      })
    }
  }

  /**
   * Get a summary of preinscriptions for public display.
   * (Total collected, list of founders who agreed to be shown)
   */
  async getSummary({ response }: HttpContext) {
    try {
      const totalCollected = await Preinscription.query()
        .where('payment_status', 'confirmed') // Compter seulement les paiements confirmés
        .sum('contribution_amount as total')
        .first()

      // Ajuste la limite et l'ordre comme tu le souhaites
      const foundersList = await Preinscription.query()
        .where('display_info', true)
        .where('payment_status', 'confirmed') // Afficher seulement les confirmés
        .orderBy('created_at', 'desc')
        .limit(20) // Exemple de limite
        .select(['id', 'name', 'shop_name', 'chosen_tier', 'contribution_amount', 'created_at']) // Sélectionne les champs nécessaires

      return response.ok({
        data:{
        total_collected: totalCollected?.$extras.total || 0,
        founders: foundersList.map(f => ({ // Formatte pour le client si besoin
            id: f.id,
            name: f.name,
            shop_name: f.shop_name,
            // message: "...", // Si tu ajoutes un champ message au modèle Preinscription
            // avatarUrl: "...", // Si tu gères des avatars
            contribution_amount: f.contribution_amount,
            chosen_tier: f.chosen_tier,
            date: f.created_at.toISODate(), // Formatte la date
        })),
      }
      })
    } catch (error) {
      console.error('Error fetching preinscription summary:', error)
      return response.internalServerError({
        message: 'Erreur lors de la récupération du résumé des préinscriptions.',
        error: error.message,
      })
    }
  }

  /**
   * Validate a payment for a preinscription (Admin action).
   */
  async validatePayment({ params, request, response /*, auth*/ }: HttpContext) {
    const payload = await request.validateUsing(this.preinscriptionValidatePaymentValidator)

    try {
      const preinscription = await Preinscription.findOrFail(params.id)

      if (preinscription.payment_status === 'confirmed' && payload.status === 'confirmed') {
        return response.ok({ message: 'Ce paiement a déjà été confirmé.', data: preinscription })
      }

      const previousStatus = preinscription.payment_status
      preinscription.payment_status = payload.status

      if (payload.admin_notes) {
        preinscription.admin_notes =
          (preinscription.admin_notes ? preinscription.admin_notes + '\n' : '') +
          `[${new Date().toISOString()}] (Statut changé de ${previousStatus} à ${payload.status}) ${payload.admin_notes}`
      } else {
        preinscription.admin_notes =
          (preinscription.admin_notes ? preinscription.admin_notes + '\n' : '') +
          `[${new Date().toISOString()}] Statut du paiement changé de ${previousStatus} à ${payload.status}.`
      }

      await preinscription.save()

      // --- DÉBUT DU CODE AJOUTÉ/MODIFIÉ POUR L'ENVOI D'EMAIL ---
      if (preinscription.payment_status === 'confirmed' && previousStatus !== 'confirmed') {
        // Envoyer l'email seulement si le statut passe à 'confirmed' et n'était pas déjà 'confirmed'
        try {
          await MailService.send({
            to: preinscription.email,
            subject: `Paiement Confirmé : Votre statut Fondateur Sublymus est actif !`,
            template: 'emails/payment_confirmed_for_preinscription', // Nouveau template
            context: {
              userName: preinscription.name,
              tierName: preinscription.chosen_tier.charAt(0).toUpperCase() + preinscription.chosen_tier.slice(1),
              contributionAmount: preinscription.contribution_amount.toLocaleString('fr-CI') + ' FCFA',
              shopName: preinscription.shop_name || null,
              siteName: "Sublymus",
              launchDate: "1er Septembre 2025", // Rendre dynamique si besoin
              supportEmail: "sublymus@gmail.com", // Ton email de support
              contactEmail:"sublymus@gmail.com",
              // Tu peux ajouter un lien direct vers leur espace/dashboard si applicable
              dashboardLink: "https://dashboard.sublymus.com/profile"
            }
          })
          logger.info(`[PreinscriptionsController] Email de confirmation de paiement envoyé à: ${preinscription.email} pour le tier: ${preinscription.chosen_tier}`)
        } catch (mailError) {
          logger.error({ email: preinscription.email, error: mailError.message, tier: preinscription.chosen_tier }, `[PreinscriptionsController] Erreur lors de l'envoi de l'email de confirmation de paiement`)
          // Ne pas faire échouer la validation du paiement si l'email échoue, mais logger l'erreur.
        }
      }
      // --- FIN DU CODE AJOUTÉ/MODIFIÉ POUR L'ENVOI D'EMAIL ---

      return response.ok({
        message: `Le statut du paiement pour la préinscription '${preinscription.name}' a été mis à jour à : ${payload.status}.`,
        data: preinscription,
      })
    } catch (error) {
      logger.error({ error: error.message, params_id: params.id }, 'Error validating preinscription payment')
      if (error.code === 'E_ROW_NOT_FOUND') {
        return response.notFound({ message: 'Préinscription non trouvée.' })
      }
      return response.internalServerError({
        message: 'Erreur lors de la validation du paiement.',
        error: error.message,
      })
    }
  }

  // --- Méthodes CRUD pour l'administration (Optionnel, à protéger) ---

  /**
   * Display a list of all preinscriptions.
   * (Admin usage)
   */
  async index({ request, response /*, auth*/ }: HttpContext) {
    // Authentification et autorisation admin requises
    const page = request.input('page', 1)
    const limit = request.input('limit', 15)
    const status = request.input('payment_status')
    const tier = request.input('chosen_tier')
    const orderBy = request.input('order_by', 'created_at')
    const orderDirection = request.input('order_direction', 'desc')
    const search = request.input('search') // Pour rechercher par nom ou email

    const query = Preinscription.query()
    // .preload('user') // Si la relation user est définie et utile
      .orderBy(orderBy, orderDirection)

    if (status) query.where('payment_status', status)
    if (tier) query.where('chosen_tier', tier)
    if (search) {
      query.where((builder) => {
        builder.where('name', 'LIKE', `%${search}%`)
               .orWhere('email', 'LIKE', `%${search}%`)
               .orWhere('shop_name', 'LIKE', `%${search}%`)
      })
    }

    const preinscriptions = await query.paginate(page, limit)
    return response.ok(preinscriptions)
  }

  /**
   * Show details of a single preinscription.
   * (Admin usage)
   */
  async show({ params, response /*, auth*/ }: HttpContext) {
    // Authentification et autorisation admin requises
    try {
      const preinscription = await Preinscription.findOrFail(params.id)
      // await preinscription.load('user') // Si besoin de charger la relation
      return response.ok(preinscription)
    } catch (error) {
      return response.notFound({ message: 'Préinscription non trouvée.' })
    }
  }

  /**
   * Update a preinscription. (Limited admin usage, e.g., correcting typos)
   * More complex updates like changing tier/amount should probably create a new record or have specific logic.
   */
  async update({ params, request, response /*, auth*/ }: HttpContext) {
    // Authentification et autorisation admin requises
    // Valider les données (créer un validateur spécifique pour l'update admin si besoin)
    const payload = request.only(['name', 'email', 'shop_name', 'display_info', 'admin_notes'])

    try {
      const preinscription = await Preinscription.findOrFail(params.id)
      preinscription.merge(payload)
      await preinscription.save()
      return response.ok({ message: 'Préinscription mise à jour.', data: preinscription })
    } catch (error) {
      return response.notFound({ message: 'Préinscription non trouvée.' })
    }
  }

  /**
   * Delete a preinscription.
   * (Admin usage - use with caution)
   */
  async destroy({ params, response /*, auth*/ }: HttpContext) {
    // Authentification et autorisation admin requises
    try {
      const preinscription = await Preinscription.findOrFail(params.id)
      await preinscription.delete()
      return response.noContent() // 204 No Content
    } catch (error) {
      return response.notFound({ message: 'Préinscription non trouvée.' })
    }
  }
}