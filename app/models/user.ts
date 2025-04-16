import { DateTime } from 'luxon'
import hash from '@adonisjs/core/services/hash'
import { compose } from '@adonisjs/core/helpers'
import { BaseModel, column, manyToMany } from '@adonisjs/lucid/orm'
import { withAuthFinder } from '@adonisjs/auth/mixins/lucid'
import { DbAccessTokensProvider } from '@adonisjs/auth/access_tokens'


// app/models/user.ts
import Role from '#models/role'
import { type ManyToMany } from '@adonisjs/lucid/types/relations'
import db from '@adonisjs/lucid/services/db' // Import db pour les helpers
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
  declare photos: string[]

   // Champ statut (depuis ton proto)
   @column()
   declare status: UserStatus

   // Ajoute phone ? (depuis proto)
   @column()
   declare phone: string | null


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


  // --- Helpers Logiques (s'appuient sur la relation 'roles') ---

   /** Charge les rôles si pas déjà chargés (optimisation) */
   async ensureRolesLoaded() {
      if (!this.roles) {
        //@ts-ignore
         await this.load('roles');
      }
    }

   /** Vérifie si l'utilisateur a un rôle spécifique par son nom */
   async hasRole(roleName: RoleName): Promise<boolean> {
      await this.ensureRolesLoaded();
      return this.roles.some(role => role.name === roleName);
   }

   /** Vérifie si l'utilisateur a une permission spécifique (via n'importe lequel de ses rôles) */
   async hasPermission(permissionKey: keyof RolePermissions): Promise<boolean> {
      await this.ensureRolesLoaded();
       // Itère sur les rôles de l'user et vérifie si au moins un a la permission
       return this.roles.some(role => role.hasPermission(permissionKey));
   }

    // Raccourcis
    async isAdmin(): Promise<boolean> { return this.hasRole('ADMIN'); }
    async isModerator(): Promise<boolean> { return this.hasRole('MODERATOR'); }
    async isSublymusManager(): Promise<boolean> {
        await this.ensureRolesLoaded();
        return this.roles.some(role => ['ADMIN', 'MODERATOR'].includes(role.name));
    }
    async isOwner(): Promise<boolean> { return this.hasRole('OWNER'); }
    async isCreator(): Promise<boolean> { return this.hasRole('CREATOR'); }
    async isAffiliate(): Promise<boolean> { return this.hasRole('AFFILIATE'); }

     // Note: isOwnerOf(storeId) se fait mieux dans Bouncer ou le service
     // en vérifiant store.user_id === this.id
}