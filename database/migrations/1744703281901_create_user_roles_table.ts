// database/migrations/TIMESTAMP_create_user_roles_table.ts
import { BaseSchema } from '@adonisjs/lucid/schema'

export default class CreateUserRolesTable extends BaseSchema {
  protected tableName = 'user_roles'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').defaultTo(this.db.rawQuery('gen_random_uuid()').knexQuery).primary().notNullable()

      table.uuid('user_id')
        .notNullable()
        .references('id')
        .inTable('users')
        .onDelete('CASCADE') // Si l'utilisateur est supprimé, ses entrées de rôle le sont aussi

      table.uuid('role_id')
        .notNullable()
        .references('id')
        .inTable('roles')
        .onDelete('CASCADE') // Si un rôle est supprimé (peu probable mais sécurité), les liaisons disparaissent

      // --- PAS de colonne store_id ici pour les rôles globaux s_server ---

      // Assure qu'un utilisateur ne peut pas avoir le même rôle global deux fois
      table.unique(['user_id', 'role_id']) //TODO tester.

      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(this.now())
      // Pas d'updated_at nécessaire ici, une assignation est un événement ponctuel
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}