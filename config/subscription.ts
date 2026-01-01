/**
 * Configuration des taux pour le système d'abonnements
 * Centralise tous les paramètres ajustables
 */

export default {
  /**
   * Taux de réduction selon la durée d'abonnement
   */
  discountRates: {
    '1_month': 0.05,   // 5% de réduction pour 1 mois
    '12_months': 0.10, // 10% de réduction pour 12 mois
  },

  /**
   * Commission d'affiliation sur les abonnements
   * Appliquée sur le prix après réduction
   */
  affiliateCommissionRate: 0.20, // 20%

  /**
   * Nombre maximum de codes d'affiliation actifs par utilisateur
   */
  maxActiveCodesPerUser: 1, // 1 code actif maximum par défaut

  /**
   * Délais pour les emails de rappel d'expiration (en jours)
   */
  expirationReminders: {
    firstReminder: 7,   // 7 jours avant expiration
    secondReminder: 3,  // 3 jours avant expiration
    finalReminder: 1,   // 1 jour avant expiration
  },

  /**
   * Auto-renewal : nombre d'heures avant expiration pour tenter le renouvellement
   */
  autoRenewalWindow: 24, // 24 heures avant expiration

  /**
   * TODO : Période de grâce après expiration (en jours)
   * Nombre de jours pendant lesquels le store reste actif après expiration
   */
  // gracePeriodDays: 3,
}
