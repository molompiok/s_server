import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'users'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').defaultTo(this.db.rawQuery('gen_random_uuid()').knexQuery).primary().notNullable()
      table.string('full_name').notNullable()
      table.string('email', 254).notNullable().unique()
      table.string('password').notNullable()
      table.jsonb('photo').defaultTo('[]') // ['/fs/user_piscture.png']
      table.string('status')
      table.uuid('phone_id')
      table.timestamp('email_verified_at', { useTz: true }).nullable().defaultTo(null)
      table.index(['email_verified_at'], 'users_email_verified_at_index')
      table.timestamps(true) 
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}