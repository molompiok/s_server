// app/models/async_confirm.ts

import { DateTime } from 'luxon'
import { BaseModel, beforeCreate, column, belongsTo } from '@adonisjs/lucid/orm'
import { v4 as uuidv4 } from 'uuid'
import User from './user.js'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import hash from '@adonisjs/core/services/hash' // Importer hash

// Énumérer les types de confirmation possibles
export enum AsyncConfirmType {
  EMAIL_VERIFICATION = 'email_verification',
  PASSWORD_RESET = 'password_reset',
  ACCOUNT_SETUP= 'account_setup'
  // Ajouter d'autres types ici si besoin
}

export default class AsyncConfirm extends BaseModel {
  public static table = 'async_confirms';

  // Utiliser selfAssignPrimary = false si l'ID est généré par la DB (comme dans la migration)
  public static selfAssignPrimaryKey = true;

  @beforeCreate()
  public static assignUuid(confirm: AsyncConfirm) {
    if (!confirm.id) { // Seulement si non auto-assigné par DB ou autre moyen
      confirm.id = uuidv4();
    }
  }

  @column({ isPrimary: true })
  declare id: string;

  // Colonne FK vers users.id
  @column({ columnName: 'user_id' }) // Nom colonne explicite en snake_case
  declare userId: string;

  // Stocke le HASH du token
  @column({ columnName: 'token_hash' }) // Nom colonne explicite
  declare tokenHash: string;

  @column() // Lucid gère snake_case par défaut ici si nom propriété est camelCase
  declare type: AsyncConfirmType;

  // Date d'expiration
  @column.dateTime({ columnName: 'expires_at' }) // Nom colonne explicite
  declare expiresAt: DateTime;

  // Date de création
  @column.dateTime({ columnName: 'created_at', autoCreate: true }) // Utiliser autoCreateTime
  declare createdAt: DateTime;

  // Date d'utilisation (null si pas utilisé)
  @column.dateTime({ columnName: 'used_at' }) // Nom colonne explicite
  declare usedAt: DateTime | null;

  // Payload JSONB
  @column({
      prepare: (value: Record<string, any> | null) => JSON.stringify(value || {}),
    //   consume: (value: string | null) => value ? JSON.parse(value) : {},
  })
  declare payload: Record<string, any> | null;

  // --- Relations ---
  @belongsTo(() => User, {
    foreignKey: 'userId', // La propriété camelCase dans ce modèle
    // localKey: 'id' // par défaut 'id'
  })
  declare user: BelongsTo<typeof User>;

  // --- Méthodes Utilitaires ---
  public get isValid(): boolean {
    return this.usedAt === null && this.expiresAt > DateTime.now();
  }

  public async markAsUsed(): Promise<void> {
      if (this.usedAt === null) { // Vérifier si null avant de sauvegarder
          this.usedAt = DateTime.now();
          await this.save();
      }
  }

  /**
   * Méthode statique pour créer et sauvegarder un nouveau token.
   * Génère un token brut, le hashe et crée l'entrée DB.
   */
  public static async generate(userId: string, type: AsyncConfirmType, expiresIn: { [key: string]: number } = { hours: 1 }, payload: Record<string, any> | null = null ): Promise<{ token: string; instance: AsyncConfirm }> {
      // 1. Invalider les anciens tokens du même type pour cet utilisateur (bonne pratique)
      await AsyncConfirm.query()
            .where('user_id', userId)
            .andWhere('type', type)
            .andWhereNull('used_at') // Seulement ceux non utilisés
            .update({ used_at: DateTime.now() }); // Marquer comme utilisés (ou delete())

      // 2. Générer le token brut sécurisé
      const token = uuidv4()+uuidv4();

      // 3. Hasher le token
      const tokenHash = await hash.make(token);

      // 4. Calculer la date d'expiration
      const expiresAt = DateTime.now().plus(expiresIn);

      // 5. Créer l'instance dans la base de données
      const instance = await AsyncConfirm.create({
           userId: userId,
           tokenHash: tokenHash,
           type: type,
           expiresAt: expiresAt,
           payload: payload,
           // usedAt est null par défaut
      });

      // 6. Retourner le token BRUT (pour l'envoyer à l'utilisateur) et l'instance créée
      return { token, instance };
  }

   /**
    * Méthode statique pour trouver et valider un token.
    * Prend le token brut, le hashe et cherche dans la DB.
    */
   public static async findValid(token: string, type: AsyncConfirmType): Promise<AsyncConfirm | null> {
       if (!token) return null;

         const potentialTokens = await AsyncConfirm.query()
            .where('type', type)
            .whereNull('used_at')
            .where('expires_at', '>', DateTime.now().toISO())
            .preload('user'); // Précharger user ici

        for (const potentialToken of potentialTokens) {
            if (await hash.verify(potentialToken.tokenHash, token)) {
                // Trouvé et valide !
                return potentialToken;
            }
        }

        // Non trouvé ou hash invalide
        return null;
   }

} // Fin classe AsyncConfirm