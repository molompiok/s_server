import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'subscription_plans'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.string('id').primary() // Plan ID (free, decouverte, pro, grand_vendeur)

      table.string('name').notNullable() // Nom affiché (ex: "Plan Découverte")
      table.integer('monthly_price').notNullable() // Prix en XOF (0 pour Free)
      table.decimal('commission_rate', 5, 4).notNullable() // Ex: 0.15 = 15%
      table.integer('max_products').nullable() // Limite produits (null = illimité)
      table.integer('max_categories').nullable() // Limite catégories
      table.boolean('custom_domain').notNullable().defaultTo(false)
      table.boolean('analytics').notNullable().defaultTo(false)
      table.boolean('priority_support').notNullable().defaultTo(false)
      table.json('features').notNullable() // Tableau des features (ex: ["custom_domain", "analytics"])
      table.boolean('is_active').notNullable().defaultTo(true)
      table.integer('sort_order').notNullable().defaultTo(0) // Ordre d'affichage

      table.timestamp('created_at')
      table.timestamp('updated_at')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}