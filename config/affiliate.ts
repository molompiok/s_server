/**
 * Configuration du système d'affiliation
 * Centralise les paramètres liés aux codes promo et tracking
 */

export default {
  /**
   * Liste des channels de partage prédéfinis
   * Utilisés pour tracker où les codes d'affiliation sont partagés
   */
  channels: [
    'Instagram',
    'Facebook',
    'YouTube',
    'WhatsApp',
    'TikTok',
    'Twitter',
    'Website',
    'Email',
    'Other',
  ] as const,

  /**
   * Durée de validité d'une relation d'affiliation (en mois)
   * Un parrain reçoit des commissions pendant cette période
   */
  affiliateRelationshipDurationMonths: 6,

  /**
   * Label pour les codes sans channel défini
   */
  genericChannelLabel: 'Générique',
}

export type AffiliateChannel = (typeof import('./affiliate.js').default.channels)[number]
