import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'apis'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id')

      table.string('name');
      table.string('version');
      table.string('source');
      table.string('internal_port');
       
      table.timestamp('created_at')
      table.timestamp('updated_at')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}