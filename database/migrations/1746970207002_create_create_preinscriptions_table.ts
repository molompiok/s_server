// database/migrations/TIMESTAMP_create_preinscriptions_table.ts
import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'preinscriptions'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.string('id').primary() // Ou .increments('id').primary() si tu préfères des entiers auto-incrémentés
      // Optionnel: table.string('user_id').references('id').inTable('users').onDelete('SET NULL')
      table.string('name').notNullable()
      table.string('email').notNullable().index() // Indexer l'email pour recherche rapide
      table.string('shop_name').nullable()
      table.enum('chosen_tier', ['bronze', 'silver', 'gold', 'custom']).notNullable()
      table.decimal('contribution_amount', 12, 2).notNullable() // Ajuster précision si besoin
      table.boolean('display_info').defaultTo(false).notNullable()
      table.enum('payment_method', ['mtn', 'orange', 'moov', 'wave', 'visa', 'other']).notNullable()
      table.jsonb('transaction_details').nullable()
      table.enum('payment_status', ['pending', 'confirmed', 'failed', 'cancelled']).defaultTo('pending').notNullable().index()
      table.text('admin_notes').nullable()

      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(this.now())
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(this.now())
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}