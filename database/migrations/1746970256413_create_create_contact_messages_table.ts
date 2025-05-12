// database/migrations/TIMESTAMP_create_contact_messages_table.ts
import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'contact_messages'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.string('id').primary()
      table.string('name').notNullable()
      table.string('email').notNullable().index()
      table.string('subject').notNullable()
      table.text('message').notNullable()
      table.enum('status', ['new', 'read', 'replied', 'archived']).defaultTo('new').notNullable().index()

      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(this.now())
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(this.now())
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}