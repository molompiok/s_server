import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'stores'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().notNullable()
      table.uuid('user_id').notNullable().references('id').inTable('users')

      table.string('name').unique()
      table.json('logo')
      table.json('cover_image')
      table.string('title')
      table.text('description')
      table.string('domaines')
      table.uuid('current_theme_id')
      table.timestamp('expire_at')
      table.integer('disk_storage_limit_gb')
      table.string('is_active')
      table.timestamps(true) 
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}