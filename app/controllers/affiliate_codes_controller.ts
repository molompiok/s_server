import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import AffiliateCode from '#models/affiliate_code'
import { v4 } from 'uuid'
import logger from '@adonisjs/core/services/logger'
import subscriptionConfig from '#config/subscription'

export default class AffiliateCodesController {
  /**
   * Schéma de validation pour création/mise à jour de code
   */
  private static codeValidator = vine.compile(
    vine.object({
      code: vine
        .string()
        .trim()
        .minLength(3)
        .maxLength(30)
        .regex(/^[a-zA-Z0-9_-]+$/)
        .transform((value) => value.toUpperCase()), // Normaliser en majuscules
      channel: vine.string().trim().optional(), // Channel optionnel (Instagram, Facebook, etc.)
    })
  )

  /**
   * GET /api/affiliate-codes/me
   * Récupérer le code d'affiliation actuel de l'utilisateur
   */
  async show({ auth, response }: HttpContext) {
    const user = await auth.authenticate()

    const affiliateCode = await AffiliateCode.query()
      .where('user_id', user.id)
      .where('is_active', true)
      .first()

    if (!affiliateCode) {
      return response.ok({
        has_code: false,
        code: null,
        affiliate_link: null,
        message: 'Vous n\'avez pas encore créé de code d\'affiliation',
      })
    }

    return response.ok({
      has_code: true,
      code: affiliateCode.code,
      channel: affiliateCode.channel,
      affiliate_link: affiliateCode.getAffiliateLink(),
      is_active: affiliateCode.is_active,
      created_at: affiliateCode.createdAt,
    })
  }

  /**
   * POST /api/affiliate-codes
   * Créer un nouveau code d'affiliation
   */
  async create({ request, response, auth }: HttpContext) {
    const user = await auth.authenticate()

    // Vérifier le nombre de codes actifs de l'utilisateur
    const activeCodesCount = await AffiliateCode.query()
      .where('user_id', user.id)
      .where('is_active', true)
      .count('* as total')

    const currentActiveCount = activeCodesCount[0].$extras.total
    const maxAllowed = subscriptionConfig.maxActiveCodesPerUser

    if (currentActiveCount >= maxAllowed) {
      return response.conflict({
        message: `Vous avez atteint la limite de ${maxAllowed} code(s) d'affiliation actif(s)`,
        code: 'MAX_CODES_REACHED',
        current_count: currentActiveCount,
        max_allowed: maxAllowed,
      })
    }

    // Validation du payload
    let payload: { code: string; channel?: string }
    try {
      payload = await request.validateUsing(AffiliateCodesController.codeValidator)
    } catch (error) {
      return response.badRequest({
        message: 'Le code fourni est invalide',
        errors: error.messages,
      })
    }

    // Vérifier si le code existe déjà (case-insensitive)
    const codeExists = await AffiliateCode.codeExists(payload.code)
    if (codeExists) {
      return response.conflict({
        message: 'Ce code d\'affiliation est déjà utilisé par quelqu\'un d\'autre',
        code: 'CODE_TAKEN',
      })
    }

    // Créer le code d'affiliation
    const affiliateCode = await AffiliateCode.create({
      id: v4(),
      user_id: user.id,
      code: payload.code,
      channel: payload.channel || null,
      is_active: true,
    })

    logger.info({ user_id: user.id, code: affiliateCode.code }, 'Affiliate code created')

    return response.created({
      message: 'Code d\'affiliation créé avec succès',
      code: affiliateCode.code,
      channel: affiliateCode.channel,
      affiliate_link: affiliateCode.getAffiliateLink(),
    })
  }

  /**
   * PATCH /api/affiliate-codes
   * Mettre à jour le code d'affiliation (avec confirmation)
   */
  async update({ request, response, auth }: HttpContext) {
    const user = await auth.authenticate()

    // Récupérer le code actif actuel
    const currentCode = await AffiliateCode.query()
      .where('user_id', user.id)
      .where('is_active', true)
      .first()

    if (!currentCode) {
      return response.notFound({
        message: 'Vous n\'avez pas de code d\'affiliation actif à modifier',
        code: 'NO_ACTIVE_CODE',
      })
    }

    // Validation du nouveau code
    let payload: { code: string; channel?: string }
    try {
      payload = await request.validateUsing(AffiliateCodesController.codeValidator)
    } catch (error) {
      return response.badRequest({
        message: 'Le nouveau code fourni est invalide',
        errors: error.messages,
      })
    }

    // Vérifier si le code est différent
    if (payload.code.toUpperCase() === currentCode.code.toUpperCase()) {
      return response.badRequest({
        message: 'Le nouveau code doit être différent de l\'actuel',
        code: 'SAME_CODE',
      })
    }

    // Vérifier si le nouveau code existe déjà (case-insensitive)
    const codeExists = await AffiliateCode.codeExists(payload.code, currentCode.id)
    if (codeExists) {
      return response.conflict({
        message: 'Ce code d\'affiliation est déjà utilisé par quelqu\'un d\'autre',
        code: 'CODE_TAKEN',
      })
    }

    // Mettre à jour le code et le channel
    const oldCode = currentCode.code
    currentCode.code = payload.code
    if (payload.channel !== undefined) {
      currentCode.channel = payload.channel || null
    }
    await currentCode.save()

    logger.info({
      user_id: user.id,
      old_code: oldCode,
      new_code: currentCode.code,
    }, 'Affiliate code updated')

    return response.ok({
      message: 'Code d\'affiliation mis à jour avec succès',
      old_code: oldCode,
      new_code: currentCode.code,
      channel: currentCode.channel,
      affiliate_link: currentCode.getAffiliateLink(),
    })
  }

  /**
   * DELETE /api/affiliate-codes
   * Désactiver le code d'affiliation actuel
   */
  async deactivate({ response, auth }: HttpContext) {
    const user = await auth.authenticate()

    const affiliateCode = await AffiliateCode.query()
      .where('user_id', user.id)
      .where('is_active', true)
      .first()

    if (!affiliateCode) {
      return response.notFound({
        message: 'Vous n\'avez pas de code d\'affiliation actif',
        code: 'NO_ACTIVE_CODE',
      })
    }

    // Désactiver le code
    affiliateCode.is_active = false
    await affiliateCode.save()

    logger.info({ user_id: user.id, code: affiliateCode.code }, 'Affiliate code deactivated')

    return response.ok({
      message: 'Code d\'affiliation désactivé avec succès',
      code: affiliateCode.code,
    })
  }

  /**
   * GET /api/affiliate-codes/:code/check
   * Vérifier si un code est disponible (public, pas besoin d'auth)
   */
  async checkAvailability({ params, response }: HttpContext) {
    const { code } = params

    if (!code || typeof code !== 'string' || code.length < 3) {
      return response.badRequest({
        message: 'Code invalide',
      })
    }

    const exists = await AffiliateCode.codeExists(code)

    return response.ok({
      code: code.toUpperCase(),
      available: !exists,
      message: exists
        ? 'Ce code est déjà utilisé'
        : 'Ce code est disponible',
    })
  }
}
