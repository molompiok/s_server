import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'stores'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary()
      table.uuid('user_id')//.notNullable().references('id').inTable('users').onDelete('CASCADE')

      table.string('name').notNullable()
      table.string('title').notNullable()
      table.text('description').notNullable()
      table.string('slug').notNullable().unique()

      table.json('logo').notNullable().defaultTo('[]')
      table.json('cover_image').notNullable().defaultTo('[]')
      table.json('domaines').notNullable().defaultTo('[]')

      table.uuid('current_theme_id').nullable().references('id').inTable('themes').onDelete('SET NULL')
      table.uuid('current_api_id').notNullable().references('id').inTable('apis').onDelete('CASCADE')

      table.timestamp('expire_at', { useTz: true }).notNullable()
      table.integer('disk_storage_limit_gb').notNullable().defaultTo(1)

      table.boolean('is_active').notNullable().defaultTo(false)
      table.boolean('is_running').notNullable().defaultTo(false)
      
      table.timestamps(true) 
      
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}


