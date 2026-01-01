import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'store_subscriptions'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.string('id').primary()

      table.uuid('store_id').notNullable() // FK vers stores
      table.string('plan_id').notNullable() // FK vers subscription_plans
      table.string('status').notNullable().defaultTo('active') // active, cancelled, expired, pending
      table.timestamp('starts_at').notNullable() // Date début abonnement
      table.timestamp('expires_at').notNullable() // Date fin abonnement
      table.string('wave_payment_intent_id').nullable() // Lien vers PaymentIntent Wave (null pour Free)
      table.string('affiliate_code').nullable() // Code affiliation utilisé (pour commission)
      table.uuid('affiliate_user_id').nullable() // ID du parrain (owner du code)
      table.timestamp('affiliate_expires_at').nullable() // Expiration relation affiliation (starts_at + 6 mois)
      table.integer('amount_paid').nullable() // Montant payé en XOF (null pour Free)
      table.integer('duration_months').notNullable().defaultTo(1) // 1 ou 12 mois
      table.json('metadata').nullable() // Infos supplémentaires (transaction, reduction, etc.)

      table.timestamp('created_at')
      table.timestamp('updated_at')

      // Foreign keys
      table.foreign('store_id').references('id').inTable('stores').onDelete('CASCADE')
      table.foreign('plan_id').references('id').inTable('subscription_plans').onDelete('RESTRICT')
      table.foreign('affiliate_user_id').references('id').inTable('users').onDelete('SET NULL')

      // Index
      table.index('store_id')
      table.index('plan_id')
      table.index('status')
      table.index('expires_at')
      table.index('affiliate_user_id')
      table.index('affiliate_expires_at')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}