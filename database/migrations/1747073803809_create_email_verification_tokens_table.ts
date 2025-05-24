// s_api/database/migrations/xxxxxxxx_create_email_verification_tokens_table.ts

import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'email_verification_tokens'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().defaultTo(this.db.rawQuery('gen_random_uuid()').knexQuery) // UUID auto-généré (si PostgreSQL) ou tu peux le générer dans le code

      table.uuid('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE') // Supprime le token si l'user est supprimé
      table.string('token', 128).notNullable().unique() // Taille suffisante, unique
      table.timestamp('expires_at', { useTz: true }).notNullable()
      
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(this.now())
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(this.now())
      
      table.index(['token'], 'email_verification_tokens_token_index')
      table.index(['user_id'], 'email_verification_tokens_user_id_index')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}