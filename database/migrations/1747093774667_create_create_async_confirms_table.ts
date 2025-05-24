// database/migrations/TIMESTAMP_create_async_confirms_table.ts

import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'async_confirms'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().defaultTo(this.db.rawQuery('gen_random_uuid()').knexQuery);

      table.uuid('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE').notNullable().index(); // Ajout notNullable et index explicite
      table.string('token_hash').notNullable().index();
      table.string('type').notNullable().index(); // Type enum comme string

      table.timestamp('expires_at', { useTz: true }).notNullable();
      table.timestamp('used_at', { useTz: true }).nullable();
      table.jsonb('payload').nullable(); // jsonb est préférable sur PostgreSQL

      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(this.now());
      // Pas d'updated_at nécessaire a priori

      // Index composite (déjà présent implicitement via l'index sur user_id et type séparés, mais on peut le rendre explicite)
      // table.index(['user_id', 'type']); // Optionnel si déjà indexés séparément
    })
  }

  async down() {
    this.schema.dropTable(this.tableName);
  }
}