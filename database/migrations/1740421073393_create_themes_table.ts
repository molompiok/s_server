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

      table.jsonb('preview_images').notNullable().defaultTo('[]')

      table.string('docker_image_name').notNullable()
      table.string('docker_image_tag').notNullable()
      table.integer('internal_port').notNullable()

      table.string('source_path').nullable()

      table.boolean('is_public').notNullable().defaultTo(false)
      table.boolean('is_active').notNullable().defaultTo(false)
      table.boolean('is_running').notNullable().defaultTo(false)
      table.boolean('is_default').notNullable().defaultTo(false)
      table.boolean('is_premium').notNullable().defaultTo(false)

      table.integer('price').nullable()

      table.timestamps(true, true)
    })

    this.schema.raw('CREATE UNIQUE INDEX unique_default_theme ON themes (is_default) WHERE is_default IS TRUE')
    
  }
  async down() {
    this.schema.dropTable(this.tableName)
    this.schema.raw('DROP INDEX IF EXISTS unique_default_theme');
  }
}