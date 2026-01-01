import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'affiliate_codes'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('channel').nullable() // Channel de partage (Instagram, Facebook, etc.)
      table.index('channel') // Index pour filtrer par channel
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('channel')
    })
  }
}