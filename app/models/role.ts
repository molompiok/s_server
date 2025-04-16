// app/models/role.ts
import { DateTime } from 'luxon'
import { BaseModel, column, manyToMany } from '@adonisjs/lucid/orm'
import User from '#models/user'
import { type ManyToMany } from '@adonisjs/lucid/types/relations'

// Définir les noms de rôles constants pour éviter les typos
export const ROLES = {
  OWNER: 'OWNER',
  ADMIN: 'ADMIN',
  MODERATOR: 'MODERATOR',
  CREATOR: 'CREATOR',
  AFFILIATE: 'AFFILIATE',
} as const // Readonly

export type RoleName = typeof ROLES[keyof typeof ROLES] // Type 'OWNER' | 'ADMIN' | ...

// Interface pour le champ JSON permissions (si on l'utilise activement)
export interface RolePermissions {
  // Stores
  'stores:create'?: boolean;
  'stores:view_all'?: boolean; // Voir listes autres users
  'stores:view_any'?: boolean; // Voir détail n'importe quel store
  'stores:update_any'?: boolean; // Modifier n'importe quel store
  'stores:delete_any'?: boolean; // Supprimer n'importe quel store
  'stores:manage_status_any'?: boolean; // Activer/désactiver any
  'stores:manage_domains_any'?: boolean; // Gérer domaines any
  // Thèmes
  'themes:manage'?: boolean; // Créer, update, delete, status, version
  'themes:set_default'?: boolean; // Définir comme défaut
  // APIs (Définitions)
  'apis:manage'?: boolean; // CRUD définitions API
  // Users
  'users:list'?: boolean;
  'users:view_any'?: boolean;
  'users:manage_roles'?: boolean; // Assigner/Retirer rôles (sauf Admin?)
  'users:impersonate'?: boolean; // Se connecter comme un autre user (Admin?)
  // Affiliates
  'affiliates:manage_self'?: boolean; // Gérer son propre compte affilié
  'affiliates:view_stats_all'?: boolean; // Voir stats tous affiliés (Admin/Modo?)
  // Creators
  'creators:manage_self'?: boolean; // Gérer son profil créateur
  'creators:submit_themes'?: boolean; // Soumettre des thèmes
  // Admin Area
  'admin:access'?: boolean; // Accès zone admin de base
  'admin:manage_system'?: boolean; // Actions système (reload, garbage...)
}


export default class Role extends BaseModel {
  @column({ isPrimary: true })
  declare id: string // Ou number si increments()

  @column()
  declare name: RoleName // Utilise le type dérivé des constantes

  @column()
  declare description: string | null

  @column({
    prepare: (value: RolePermissions | null) => JSON.stringify(value || {}),
    // consume: (value: string | null): RolePermissions => {
    //   try {
    //     const parsed = value ? JSON.parse(value) : {};
    //     // Retourne un objet, même vide, par défaut
    //     return typeof parsed === 'object' && parsed !== null ? parsed : {};
    //   } catch (e) {
    //      console.error(`Error parsing permissions JSON for role: ${value}`, e);
    //     return {};
    //   }
    // }
  })
  declare permissions: RolePermissions

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  // Relation ManyToMany vers les utilisateurs
  @manyToMany(() => User, {
    pivotTable: 'user_roles',
    localKey: 'id',
    pivotForeignKey: 'role_id', // La clé de Role dans le pivot
    relatedKey: 'id',
    pivotRelatedForeignKey: 'user_id', // La clé de l'autre modèle (User)
  })
  declare users: ManyToMany<typeof User>

   // Helper pour vérifier une permission spécifique DANS CE ROLE
  hasPermission(permissionKey: keyof RolePermissions): boolean {
     // Vérifie si la clé existe et est explicitement true
     // Si la clé n'existe pas, on considère que c'est false.
     return !!this.permissions[permissionKey];
   }
}