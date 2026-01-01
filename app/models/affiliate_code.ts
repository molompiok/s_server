import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import User from './user.js'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import env from '#start/env'

export default class AffiliateCode extends BaseModel {
  @column({ isPrimary: true })
  declare id: string

  @column()
  declare user_id: string

  @column()
  declare code: string

  @column()
  declare is_active: boolean

  @column()
  declare channel: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  // Relations
  @belongsTo(() => User, {
    foreignKey: 'user_id',
  })
  declare owner: BelongsTo<typeof User>

  /**
   * Génère le lien d'affiliation pour ce code
   */
  getAffiliateLink(): string {
    const baseUrl = env.get('SERVER_DOMAINE')
    return `https://${baseUrl}/affiliate/${this.code.toLowerCase()}`
  }

  /**
   * Vérifie si un code existe déjà (case-insensitive)
   */
  static async codeExists(code: string, excludeId?: string): Promise<boolean> {
    const query = this.query().whereRaw('LOWER(code) = ?', [code.toLowerCase()])

    if (excludeId) {
      query.whereNot('id', excludeId)
    }

    const existing = await query.first()
    return !!existing
  }
}