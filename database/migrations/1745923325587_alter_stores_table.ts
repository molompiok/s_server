import { BaseSchema } from '@adonisjs/lucid/schema'

export default class AlterStoresAddFields extends BaseSchema {
  protected tableName = 'stores'

  public async up () {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('slash_url').nullable()
      table.string('timezone').nullable()
      table.string('currency').nullable()
      table.jsonb('favicon').nullable()
    })
  }

  public async down () {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('slash_url')
      table.dropColumn('timezone')
      table.dropColumn('currency')
      table.dropColumn('favicon')
    })
  }
}
