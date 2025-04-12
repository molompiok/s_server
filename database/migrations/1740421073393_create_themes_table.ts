import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'themes'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary()
      table.uuid('creator_id')//.nullable().references('id').inTable('users').onDelete('SET NULL')
      table.string('name').notNullable()
      table.string('slug').notNullable().unique()
      table.text('description').nullable()

      table.json('views').notNullable().defaultTo('[]')

      table.string('docker_image_name').notNullable()
      table.string('docker_image_tag').notNullable()
      table.integer('internal_port').notNullable()

      table.string('source_path').nullable()

      table.boolean('is_public').notNullable().defaultTo(false)
      table.boolean('is_active').notNullable().defaultTo(false)
      table.boolean('is_running').notNullable().defaultTo(false)
      table.boolean('is_default').notNullable().defaultTo(false)
      table.boolean('is_premium').notNullable().defaultTo(false)

      table.boolean('price').notNullable().defaultTo(false)


      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}