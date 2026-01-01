import { DateTime } from 'luxon'
import hash from '@adonisjs/core/services/hash'
import { compose } from '@adonisjs/core/helpers'
import { BaseModel, column, manyToMany, hasMany } from '@adonisjs/lucid/orm'
import { withAuthFinder } from '@adonisjs/auth/mixins/lucid'
import { DbAccessTokensProvider } from '@adonisjs/auth/access_tokens'


// app/models/user.ts
import Role from '#models/role'
import { type ManyToMany, type HasMany } from '@adonisjs/lucid/types/relations'
import UserAuthentification from './user_authentification.js'
import Store from './store.js'
import AffiliateCode from './affiliate_code.js'

// Types User Status (depuis ton proto)
export const USER_STATUS = {
  NEW: 'NEW',
  VISIBLE: 'VISIBLE',
  SUSPENDED: 'SUSPENDED',
  DELETED: 'DELETED',
} as const
export type UserStatus = typeof USER_STATUS[keyof typeof USER_STATUS]

const AuthFinder = withAuthFinder(() => hash.use('scrypt'), {
  uids: ['email'],
  passwordColumnName: 'password'
})

export default class User extends compose(BaseModel, AuthFinder) {

  static accessTokens = DbAccessTokensProvider.forModel(User, {
    // Tu peux personnaliser ici si besoin :
    table: 'auth_access_tokens',
    type: 'api_token',
    expiresIn: '30 days',
  })

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare full_name: string | null // renommé depuis name

  @column()
  declare email: string

  @column({ serializeAs: null }) // Bon réflexe
  declare password: string

  // Garde photos en JSON si multi-images
  @column({
    prepare: (value: string[] | null) => JSON.stringify(value || []),
    // consume: (value: string | null): string[] => (value ? JSON.parse(value) : [])
  })
  declare photo: string[]

  // Champ statut (depuis ton proto)
  @column()
  declare status: UserStatus

  // Ajoute phone ? (depuis proto)
  @column()
  declare phone: string | null

  // Wallets Wave
  @column()
  declare wave_main_wallet_id: string | null

  @column.dateTime({ autoCreate: false, autoUpdate: false }) // Pas de gestion auto par Lucid
  declare email_verified_at: DateTime | null


  // Gardé updatedAt nullable pour correspondre au proto ? Ou pas nullable ?
  @column.dateTime({ autoCreate: true })
  declare created_at: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updated_at: DateTime | null

  @manyToMany(() => Store, {
    pivotTable: 'store_collaborators', // obligatoire si différent de "store_user"
  })
  declare collab_stores: ManyToMany<typeof Store>

  // --- Relations ---
  @manyToMany(() => Role, {
    pivotTable: 'user_roles',
    localKey: 'id',
    pivotForeignKey: 'user_id',
    relatedKey: 'id',
    pivotRelatedForeignKey: 'role_id',
    // On ne charge PAS store_id du pivot ici car pas pertinent pour les rôles s_server
    // pivotColumns: [] // Vide ou omis
  })
  declare roles: ManyToMany<typeof Role>

  declare socialAccounts: ManyToMany<typeof UserAuthentification>

  @hasMany(() => AffiliateCode, {
    foreignKey: 'user_id',
  })
  declare affiliateCodes: HasMany<typeof AffiliateCode>

  @hasMany(() => Store, {
    foreignKey: 'user_id',
  })
  declare stores: HasMany<typeof Store>

  // Relation vers profile si tu le crées
  // @hasOne(() => Profile)
  // declare profile: HasOne<typeof Profile>

  public static async VerifyUser(email: string, password: string) {
    const user = await User.findByOrFail('email', email)
    if (!(await hash.verify(user.password, password))) {
      throw new Error('Invalid credentials')
    }
    return user
  }

  get isEmailVerified(): boolean {
    // La double négation (!!) convertit une valeur "truthy" (comme un objet DateTime)
    // en true, et une valeur "falsy" (comme null) en false.
    return !!this.email_verified_at;
  }

  /**
   * Methode idempotente pour s'assurer que le wallet principal existe
   * Cree le wallet seulement s'il n'existe pas deja
   * @returns L'ID du wallet (existant ou nouvellement cree)
   */
  async ensureMainWalletExists(): Promise<string> {
    // Si le wallet existe deja, retourner son ID
    if (this.wave_main_wallet_id) {
      return this.wave_main_wallet_id
    }

    // Importer dynamiquement pour eviter les dependances circulaires
    const waveService = (await import('#services/payments/wave')).default
    const logger = (await import('@adonisjs/core/services/logger')).default

    try {
      const wallet = await waveService.createWallet({
        owner_id: this.id,
        owner_name: this.full_name || this.email,
        entity_type: 'VENDOR',
        currency: 'XOF',
      })

      this.wave_main_wallet_id = wallet.id
      await this.save()

      logger.info({ user_id: this.id, wallet_id: wallet.id }, 'Main wallet created')
      return wallet.id
    } catch (error: any) {
      logger.error({
        user_id: this.id,
        error: error.message
      }, 'Failed to create main wallet')
      throw error
    }
  }

  // --- Helpers Logiques (s'appuient sur la relation 'roles') ---

  /** Charge les rôles si pas déjà chargés (optimisation) */
  async ensureRolesLoaded() {
    if (!this.roles) {
      //@ts-ignore
      await this.load('roles');
    }
  }

  /**
   * Retourne le premier code d'affiliation actif de l'utilisateur
   * @returns Le code actif ou null
   */
  async hasCode(): Promise<AffiliateCode | null> {
    const activeCode = await AffiliateCode.query()
      .where('user_id', this.id)
      .where('is_active', true)
      .first()

    return activeCode
  }

  // Note: isOwnerOf(storeId) se fait mieux dans Bouncer ou le service
  // en vérifiant store.user_id === this.id
}