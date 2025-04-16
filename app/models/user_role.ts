// app/models/user_role.ts
import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'
// Pas besoin d'importer User ou Role ici, sauf si tu veux définir
// explicitement des relations belongsTo (pas strictement nécessaire pour une table pivot)

export default class UserRole extends BaseModel {
  // Spécifie explicitement le nom de la table
  static table = 'user_roles'

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare userId: string // Note: Lucid utilise camelCase pour les propriétés liées aux clés étrangères

  @column()
  declare roleId: string

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  // --- Optionnel : Relations inverses ---
  // Si tu as besoin d'accéder à l'User ou au Role DEPUIS un objet UserRole
  /*
  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>

  @belongsTo(() => Role)
  declare role: BelongsTo<typeof Role>
  */
}