// database/migrations/TIMESTAMP_create_roles_table.ts
import { BaseSchema } from '@adonisjs/lucid/schema'

export default class CreateRolesTable extends BaseSchema {
  protected tableName = 'roles'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().defaultTo(this.db.rawQuery('gen_random_uuid()').knexQuery) // Ou .increments() si tu préfères des IDs entiers
      table.string('name', 50).notNullable().unique() // OWNER, ADMIN, MODERATOR, CREATOR, AFFILIATE
      table.text('description').nullable() // Description du rôle
      // On pourrait ajouter un flag pour indiquer les rôles "assignables" vs "internes"
      // table.boolean('is_assignable').notNullable().defaultTo(true)

      // Permissions (Stockées en JSONB dans ce modèle simple)
      // Alternative plus complexe: Table permissions + table pivot role_permissions
       table.jsonb('permissions').notNullable().defaultTo('{}')
       // Exemple: { 'stores:create': true, 'themes:manage': true, 'users:list': false }

       table.timestamps(true) 
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}