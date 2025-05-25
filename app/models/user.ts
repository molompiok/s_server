import { DateTime } from 'luxon'
import hash from '@adonisjs/core/services/hash'
import { compose } from '@adonisjs/core/helpers'
import { BaseModel, column, manyToMany } from '@adonisjs/lucid/orm'
import { withAuthFinder } from '@adonisjs/auth/mixins/lucid'
import { DbAccessTokensProvider } from '@adonisjs/auth/access_tokens'


// app/models/user.ts
import Role from '#models/role'
import { type ManyToMany } from '@adonisjs/lucid/types/relations'
import { type RoleName, type RolePermissions } from '#models/role' // Importe les types

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

export default class User  extends compose(BaseModel, AuthFinder)  {

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

  @column.dateTime({ autoCreate: false, autoUpdate: false }) // Pas de gestion auto par Lucid
  declare email_verified_at: DateTime | null
  

  // Gardé updatedAt nullable pour correspondre au proto ? Ou pas nullable ?
  @column.dateTime({ autoCreate: true })
  declare created_at: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updated_at: DateTime | null

 
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

  // --- Helpers Logiques (s'appuient sur la relation 'roles') ---

   /** Charge les rôles si pas déjà chargés (optimisation) */
   async ensureRolesLoaded() {
      if (!this.roles) {
        //@ts-ignore
         await this.load('roles');
      }
    }


     // Note: isOwnerOf(storeId) se fait mieux dans Bouncer ou le service
     // en vérifiant store.user_id === this.id
}