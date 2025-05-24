// s_api/app/models/email_verification_token.ts

import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import User from '#models/user' // Importer le modèle User
import { v4 as uuidv4 } from 'uuid' // Si tu génères l'ID dans le code
import { beforeCreate } from '@adonisjs/lucid/orm'

export default class EmailVerificationToken extends BaseModel {
  // Assigner l'ID manuellement si la DB ne le fait pas
  @beforeCreate()
  public static assignUuid(token: EmailVerificationToken) {
    if (!token.id) { // Seulement si l'ID n'est pas déjà défini (ex: par la DB)
      token.id = uuidv4()
    }
  }

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare user_id: string 

  @column()
  declare token: string

  @column.dateTime()
  declare expires_at: DateTime

  @column.dateTime({ autoCreate: true })
  declare created_at: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updated_at: DateTime

   @belongsTo(() => User, {
      foreignKey: 'user_id', 
    })
  declare user: BelongsTo<typeof User>
}

/*


  if (!targetUser) {
        await trx.rollback()
        return response.notFound({ message: `Utilisateur avec l'email ${email} non trouvé.` })
      }
=> si l'utilisateur n'existe pas envoie un mail d'inviations, comme avec le confirm email,
utilise l'event (invite-collaborator)  et passe les infos necessaires.

un email sera envoyer avec l'url d'authentification de la boutique + ( un role ), le collaborateur initer va se connecter sur sublymus et le route /api/auth/_internal/social-callback sera appeler avec les info du user pour la ceation s'il et verification, 

il va donc 
*/