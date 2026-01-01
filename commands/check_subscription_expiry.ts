import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import subscriptionExpiryWorker from '#services/subscription_expiry_worker'

export default class CheckSubscriptionExpiry extends BaseCommand {
  static commandName = 'subscription:check-expiry'
  static description = 'Vérifie et met à jour les abonnements expirés'

  static options: CommandOptions = {
    startApp: true, // Démarre l'application Adonis (nécessaire pour DB, etc.)
  }

  async run() {
    this.logger.info('🔍 Vérification des abonnements expirés...')

    try {
      // Renouvellement automatique (avant expiration)
      await subscriptionExpiryWorker.autoRenewSubscriptions()

      // Vérifier les expirations
      await subscriptionExpiryWorker.run()

      // Vérifier les expirations à venir (7 jours)
      await subscriptionExpiryWorker.checkUpcomingExpirations()

      // Attribuer plan Free aux stores sans abonnement
      await subscriptionExpiryWorker.assignFreePlanToInactiveStores()

      this.logger.success('✅ Vérification terminée avec succès')
    } catch (error: any) {
      this.logger.error('❌ Erreur lors de la vérification')
      this.logger.error(error.message)
      this.exitCode = 1
    }
  }
}