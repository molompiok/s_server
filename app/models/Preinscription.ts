// app/Models/Preinscription.ts
import { DateTime } from 'luxon'
import { BaseModel, beforeCreate, column, belongsTo } from '@adonisjs/lucid/orm'
import { nanoid } from 'nanoid' // Pour générer des ID courts et uniques si besoin
import User from './user.js'
import {type BelongsTo } from '@adonisjs/lucid/types/relations'

export type PreinscriptionPaymentStatus = 'pending' | 'confirmed' | 'failed' | 'cancelled'
export type PreinscriptionTier = 'bronze' | 'silver' | 'gold' | 'custom'
export type PreinscriptionPaymentMethod = 'mtn' | 'orange' | 'moov' | 'wave' | 'visa' | 'other'

export default class Preinscription extends BaseModel {
  public static selfAssignPrimaryKey = true // Si on utilise nanoid pour l'id

  @column({ isPrimary: true })
  declare id: string

  // Optionnel: Si lié à un utilisateur enregistré dans s_server
  @column()
  declare user_id: string | null
  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>

  @column()
  declare name: string // Nom du contributeur

  @column()
  declare email: string // Email du contributeur

  @column()
  declare shop_name: string | null // Nom de la future boutique

  @column()
  declare chosen_tier: PreinscriptionTier

  @column()
  declare contribution_amount: number // En FCFA (ou la plus petite unité de ta monnaie)

  @column()
  declare display_info: boolean // Si l'info peut être affichée publiquement

  @column()
  declare payment_method: PreinscriptionPaymentMethod

  @column({
    prepare: (value: any) => JSON.stringify(value || {}), // Assurer que c'est toujours un objet JSON valide
    // consume: (value: string | null) => (value ? JSON.parse(value) : {}),
  })
  declare transaction_details: Record<string, any> | null // Pour num tél, ID transaction, etc.

  @column()
  declare payment_status: PreinscriptionPaymentStatus

  @column()
  declare admin_notes: string | null // Pour des notes par l'admin lors de la validation

  @column.dateTime({ autoCreate: true })
  declare created_at: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updated_at: DateTime

  @beforeCreate()
  public static async assignUuid(preinscription: Preinscription) {
    if (!preinscription.id) { // Assigner seulement si pas déjà défini (pourrait être utile si l'ID vient du client)
      preinscription.id = `pre_${nanoid(10)}` // Exemple: pre_aBcDeFgHiJ
    }
  }
}