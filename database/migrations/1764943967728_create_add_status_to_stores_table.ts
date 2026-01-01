import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'stores'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      // Status du store: active, suspended (période de grâce), inactive
      table.string('status').notNullable().defaultTo('active')
      table.timestamp('suspended_at').nullable() // Date de début de suspension (pour calcul 3 jours)
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('status')
      table.dropColumn('suspended_at')
    })
  }
}