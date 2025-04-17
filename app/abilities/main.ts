//app/abilities/main.ts
import {Bouncer} from '@adonisjs/bouncer'
// import { policies } from '#policies/main' // Garde ça, même si on n'utilise pas les classes Policy tout de suite
import User from '#models/user'
import Store from '#models/store'
import { ROLES } from '#models/role'
// import Theme from '#models/theme'
// import Api from '#models/api'

// Helper pour rendre le code plus lisible

const hasRole =  (user: User, roleName:keyof typeof ROLES) => {
    user.roles = user.roles ?? [];
    return user.roles.some(role => role.name === roleName)
  }
  
const isAdmin = (user: User) =>hasRole(user,'ADMIN') || user.email == 'sublymus@gmail.com' || user.email == 'sablymus@gmail.com'
const isModerator = (user: User) =>hasRole(user,'MODERATOR')
const isOwnerRole = (user: User) =>hasRole(user,'OWNER')
const isCreatorRole = (user: User) =>hasRole(user,'CREATOR')
const isAffiliateRole = (user: User) =>hasRole(user,'AFFILIATE')

const isManager = (user: User) => isAdmin(user) || isModerator(user)

export  const CHECK_ROLES = {
  isAdmin,
  isModerator,
  isOwnerRole,
  isCreatorRole,
  isAffiliateRole,
  isManager
} 

/**
 * Export des abilities définies globalement.
 * La première fonction define reçoit le User connecté.
 * La deuxième fonction (optionnelle) reçoit la ou les ressources concernées.
 */

// --- Abilities Stores ---

// Peut voir la liste complète des stores (admin/modo) ou juste les siens (owner)
export const viewStoreList = Bouncer.ability((user: User) => {
    // Par défaut, seul l'admin/modo voit tout, mais le contrôleur filtrera pour l'owner
     return isManager(user) || isOwnerRole(user); // L'owner peut voir la liste (filtrée ensuite)
})

// Peut voir les détails d'un store spécifique
export const viewStore = Bouncer.ability((user: User, store: Store) => {
     if (isManager(user)) return true; // Admin/Modo voit tout
     // Owner voit le sien
     return isOwnerRole(user) && store.user_id === user.id;
})

// Peut créer un nouveau store (seulement les users avec le rôle OWNER ?)
export const createStore = Bouncer.ability((user: User) => {
     return isOwnerRole(user) || isAdmin(user); // Admin peut créer pour qqn d'autre ? Ou Owner seulement
})

// Peut mettre à jour un store
export const updateStore = Bouncer.ability((user: User, store: Store) => {
     if (isAdmin(user)) return true; // Admin peut tout éditer
     // Owner peut éditer le sien
     return isOwnerRole(user) && store.user_id === user.id;
})

// Peut supprimer un store (Restrictif : Admin seulement pour l'instant)
export const deleteStore = Bouncer.ability((user: User, _store: Store) => {
    return isAdmin(user);
})

// Peut gérer les domaines d'un store
export const manageStoreDomains = Bouncer.ability((user: User, store: Store) => {
    if (isAdmin(user)) return true;
     return isOwnerRole(user) && store.user_id === user.id;
})

// Peut gérer le thème d'un store
export const manageStoreTheme = Bouncer.ability((user: User, store: Store) => {
    if (isAdmin(user)) return true;
     return isOwnerRole(user) && store.user_id === user.id;
})

// Peut gérer l'API d'un store
export const manageStoreApi = Bouncer.ability((user: User, store: Store) => {
    if (isAdmin(user)) return true;
     return isOwnerRole(user) && store.user_id === user.id;
})

// Peut gérer l'état d'un store (start/stop/restart/scale)
export const manageStoreState = Bouncer.ability((user: User, store: Store) => {
    // Peut-être que les modérateurs peuvent aussi stop/start/restart ?
     if (isManager(user)) return true;
     return isOwnerRole(user) && store.user_id === user.id;
})

// Peut activer/désactiver un store (Admin/Modo ?)
export const manageStoreActivation = Bouncer.ability((user: User, _store: Store) => {
     return isManager(user); // Seuls Admin/Modo pour l'instant
})


// --- Abilities Thèmes (Globaux) ---

// Peut gérer entièrement les thèmes (CRUD, status, version, défaut...)
export const manageThemes = Bouncer.ability((user: User) => {
    // Pour l'instant, Admin seulement, mais on pourrait affiner pour les Modérateurs
     return isAdmin(user);
    // Alternative : vérifier permission 'themes:manage' du rôle Moderator
    // return isAdmin(user) || (isModerator(user) && await user.hasPermission('themes:manage'));
})

// Qui peut soumettre/créer un thème (potentiellement Créateur ou Admin)
export const createTheme = Bouncer.ability((user: User) => {
    return isCreatorRole(user) || isAdmin(user);
})

// Peut mettre à jour UN theme (Peut-être le Créateur pour SES thèmes?)
// Nécessite d'ajouter 'creatorId' au modèle Theme pour ça.
// Pour l'instant, on reprend manageThemes (seul Admin/Modo)
export const updateTheme = Bouncer.ability((user: User, /*theme: Theme*/) => {
    // Exemple si creatorId existe :
    // if (isAdmin(user)) return true;
    // if (isCreatorRole(user) && theme.creatorId === user.id) return true;
    // return false;
    return isManager(user); // Simplifié pour l'instant
})


// --- Abilities APIs (Définitions Globales) ---

// Peut gérer entièrement les définitions d'API (CRUD, défaut...)
export const manageApis = Bouncer.ability((user: User) => {
    // Admin seulement pour ces actions critiques
    return isAdmin(user);
})


// --- Abilities Actions Admin ---

// Peut accéder aux endpoints du AdminControlsController
export const performAdminActions = Bouncer.ability((user: User) => {
    // Pour l'instant, Admin et Modérateur peuvent voir/faire les actions
    // mais certaines devraient être limitées à l'Admin (ex: garbage collect delete)
    return isManager(user);
})

// Ability spécifique pour les actions dangereuses (Admin uniquement)
export const performDangerousAdminActions = Bouncer.ability((user: User) => {
    return isAdmin(user);
})


// --- Abilities Futures ---

// Peut voir son propre tableau de bord Affilié
export const viewAffiliateDashboard = Bouncer.ability((user: User) => {
    return isAffiliateRole(user) || isManager(user);
})

// Peut gérer son profil/infos bancaires Affilié
export const manageAffiliateProfile = Bouncer.ability((user: User) => {
    return isAffiliateRole(user) || isAdmin(user); // Admin peut aider
})

// Peut voir son propre tableau de bord Créateur
export const viewCreatorDashboard = Bouncer.ability((user: User) => {
    return isCreatorRole(user) || isManager(user);
})

// Peut gérer son profil public Créateur
export const manageCreatorProfile = Bouncer.ability((user: User) => {
    return isCreatorRole(user) || isAdmin(user);
})