import { BaseSeeder } from '@adonisjs/lucid/seeders'
import SubscriptionPlan from '#models/subscription_plan'

export default class extends BaseSeeder {
  async run() {
    // Utiliser updateOrCreate pour éviter les doublons lors de multiples seeds
    await SubscriptionPlan.updateOrCreate(
      { id: 'free' },
      {
        name: 'Plan Gratuit',
        monthly_price: 0,
        commission_rate: 0.20, // 20% de commission
        max_products: 10,
        max_categories: 3,
        custom_domain: false,
        analytics: false,
        priority_support: false,
        features: ['basic_store', 'mobile_responsive', 'ssl_certificate'],
        is_active: true,
        sort_order: 1,
      }
    )

    await SubscriptionPlan.updateOrCreate(
      { id: 'decouverte' },
      {
        name: 'Plan Découverte',
        monthly_price: 5000, // 5.000 XOF/mois
        commission_rate: 0.15, // 15% de commission
        max_products: 50,
        max_categories: 10,
        custom_domain: false,
        analytics: true,
        priority_support: false,
        features: [
          'basic_store',
          'mobile_responsive',
          'ssl_certificate',
          'analytics',
          'email_support',
          'discount_codes',
        ],
        is_active: true,
        sort_order: 2,
      }
    )

    await SubscriptionPlan.updateOrCreate(
      { id: 'pro' },
      {
        name: 'Plan Pro',
        monthly_price: 15000, // 15.000 XOF/mois
        commission_rate: 0.10, // 10% de commission
        max_products: 200,
        max_categories: null, // Illimité
        custom_domain: true,
        analytics: true,
        priority_support: true,
        features: [
          'basic_store',
          'mobile_responsive',
          'ssl_certificate',
          'analytics',
          'custom_domain',
          'priority_support',
          'discount_codes',
          'advanced_analytics',
          'export_data',
          'api_access',
        ],
        is_active: true,
        sort_order: 3,
      }
    )

    await SubscriptionPlan.updateOrCreate(
      { id: 'grand_vendeur' },
      {
        name: 'Plan Grand Vendeur',
        monthly_price: 40000, // 40.000 XOF/mois
        commission_rate: 0.05, // 5% de commission
        max_products: null, // Illimité
        max_categories: null, // Illimité
        custom_domain: true,
        analytics: true,
        priority_support: true,
        features: [
          'basic_store',
          'mobile_responsive',
          'ssl_certificate',
          'analytics',
          'custom_domain',
          'priority_support',
          'discount_codes',
          'advanced_analytics',
          'export_data',
          'api_access',
          'unlimited_products',
          'dedicated_account_manager',
          'custom_integrations',
          'white_label',
        ],
        is_active: true,
        sort_order: 4,
      }
    )

    console.log('✅ Subscription plans seeded successfully')
  }
}
