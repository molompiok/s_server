import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'apis'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary()

      table.string('name').notNullable()
      table.string('slug').notNullable().unique()

      table.text('description').nullable()

      table.string('docker_image_name').notNullable()
      table.string('docker_image_tag').notNullable()
      table.integer('internal_port').notNullable()

      table.string('source_path').nullable()

      table.boolean('is_default').notNullable().defaultTo(false)

       
      table.timestamps(true, true)
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}