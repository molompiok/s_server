import { DateTime } from 'luxon'
import limax from 'limax';
import { BaseModel, beforeSave, belongsTo, column, computed, manyToMany } from '@adonisjs/lucid/orm'
import Api from './api.js'
import Theme from './theme.js'
import {type ManyToMany, type BelongsTo } from '@adonisjs/lucid/types/relations'
import env from '#start/env';
import User from './user.js';
import { http } from '../Utils/functions.js';

export default class Store extends BaseModel {
  @column({ isPrimary: true })
  declare id: string

  @column()
  declare user_id: string

  @column()
  declare name: string

  @column()
  declare title: string

  @column()
  declare description: string

  @column()
  declare slug: string; // Identifiant unique textuel, ex: 'elegance-v2', 'minimalist-dark'

  @column({
    prepare(value) {
      return JSON.stringify(value);
    },
  })
  declare logo: string[]

  @column({
    prepare(value) {
      return JSON.stringify(value);
    },
  })
  declare favicon: string[]

  @column({
    prepare(value) {
      return JSON.stringify(value);
    },
  })
  declare cover_image: string[]

  @column()
  declare slash_url: string | null

  @column()
  declare timezone: string | null

  @column()
  declare currency: string | null


  @column({
    prepare(value) {
      return JSON.stringify(value);
    },
  })
  declare domain_names: string[]

  @column()
  declare current_theme_id: string | null

  @column()
  declare current_api_id: string | null

  @column.dateTime({})
  declare expire_at: DateTime

  @column()
  declare disk_storage_limit_gb: number

  @column()
  declare is_active: boolean

  @column()
  declare is_running: boolean

  @column()
  declare is_seed_applyed: boolean

  // Status du store (active, suspended, inactive)
  @column()
  declare status: string

  @column.dateTime()
  declare suspended_at: DateTime | null

  // Wave wallet
  @column()
  declare wave_store_wallet_id: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @beforeSave()
  public static async saveSlug(store: Store) {
    let baseSlug = limax(store.name, { maintainCase: false })
    store.slug = baseSlug
  }

  @computed()
  public get default_domain() {
    return `${this.slug}.${env.get('SERVER_DOMAINE')}`
  }

  @computed()
  public get api_url() {
    return `${http}api.${env.get('SERVER_DOMAINE')}/${this.id}`
  }

   @belongsTo(() => User, {
    foreignKey: 'user_id',
  })
  declare user: BelongsTo<typeof User>

  @manyToMany(() => User, {
    pivotTable: 'store_collaborators',
  })
  declare collaborators: ManyToMany<typeof User>

  @belongsTo(() => Api, {
    foreignKey: 'current_api_id',
    localKey: 'id',
  })
  declare currentApi: BelongsTo<typeof Api>

  @belongsTo(() => Theme, {
    foreignKey: 'current_theme_id',
    localKey: 'id',
  })
  declare currentTheme: BelongsTo<typeof Theme>

  /**
   * Méthode idempotente pour s'assurer que le wallet STORE existe
   * Crée le wallet seulement s'il n'existe pas déjà
   * @returns L'ID du wallet (existant ou nouvellement créé)
   */
  async ensureStoreWalletExists(): Promise<string> {
    // Si le wallet existe déjà, retourner son ID
    if (this.wave_store_wallet_id) {
      return this.wave_store_wallet_id
    }

    // Importer dynamiquement pour éviter les dépendances circulaires
    const waveService = (await import('#services/payments/wave')).default
    const logger = (await import('@adonisjs/core/services/logger')).default

    try {
      const wallet = await waveService.createWallet({
        owner_id: this.id,
        owner_name: this.name,
        entity_type: 'VENDOR', // STORE utilise le type VENDOR
        currency: this.currency || 'XOF',
      })

      this.wave_store_wallet_id = wallet.id
      await this.save()

      logger.info({ store_id: this.id, wallet_id: wallet.id }, 'Store wallet created')
      return wallet.id
    } catch (error: any) {
      logger.error({
        store_id: this.id,
        error: error.message
      }, 'Failed to create store wallet')
      throw error
    }
  }

}