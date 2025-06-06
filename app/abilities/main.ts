//app/abilities/main.ts
import {Bouncer} from '@adonisjs/bouncer'
// import { policies } from '#policies/main' // Garde ça, même si on n'utilise pas les classes Policy tout de suite
import User from '#models/user'
import Store from '#models/store'
import { CHECK_ROLES } from './roleValidation.js';

/**
 * Export des abilities définies globalement.
 * La première fonction define reçoit le User connecté.
 * La deuxième fonction (optionnelle) reçoit la ou les ressources concernées.
 */

// --- Abilities Stores ---

// Peut voir la liste complète des stores (admin/modo) ou juste les siens (owner)
export const viewStoreList = Bouncer.ability((user: User) => {
    // Par défaut, seul l'admin/modo voit tout, mais le contrôleur filtrera pour l'owner
     return CHECK_ROLES.isManager(user) || CHECK_ROLES.isOwnerRole(user); // L'owner peut voir la liste (filtrée ensuite)
})

// Peut voir les détails d'un store spécifique
export const viewStore = Bouncer.ability((user: User, store: Store) => {
     if (CHECK_ROLES.isManager(user)) return true; // Admin/Modo voit tout
     // Owner voit le sien
     return store.user_id === user.id;
})

// Peut créer un nouveau store (seulement les users avec le rôle OWNER ?)
export const createStore = Bouncer.ability((user: User) => {
     return CHECK_ROLES.isAdmin(user); // Admin peut créer pour qqn d'autre ? Ou Owner seulement
})

// Peut mettre à jour un store
export const updateStore = Bouncer.ability((user: User, store: Store) => {
     if (CHECK_ROLES.isAdmin(user)) return true; // Admin peut tout éditer
     return store.user_id === user.id;
})

// Peut supprimer un store (Restrictif : Admin seulement pour l'instant)
export const deleteStore = Bouncer.ability((user: User, _store: Store) => {
    return CHECK_ROLES.isAdmin(user);
})

// Peut gérer les domaines d'un store
export const manageStoreDomains = Bouncer.ability((user: User, store: Store) => {
    if (CHECK_ROLES.isAdmin(user)) return true;
     return store.user_id === user.id;
})

// Peut gérer le thème d'un store
export const manageStoreTheme = Bouncer.ability((user: User, store: Store) => {
    if (CHECK_ROLES.isAdmin(user)) return true;
     return store.user_id === user.id;
})

// Peut gérer l'API d'un store
export const manageStoreApi = Bouncer.ability((user: User, store: Store) => {
    if (CHECK_ROLES.isAdmin(user)) return true;
     return store.user_id === user.id;
})

// Peut gérer l'état d'un store (start/stop/restart/scale)
export const manageStoreState = Bouncer.ability((user: User, store: Store) => {
    // Peut-être que les modérateurs peuvent aussi stop/start/restart ?
     if (CHECK_ROLES.isManager(user)) return true;
     return store.user_id === user.id;
})

// Peut activer/désactiver un store (Admin/Modo ?)
export const manageStoreActivation = Bouncer.ability((user: User, _store: Store) => {
     return CHECK_ROLES.isManager(user); // Seuls Admin/Modo pour l'instant
})


// --- Abilities Thèmes (Globaux) ---

// Peut gérer entièrement les thèmes (CRUD, status, version, défaut...)
export const manageThemes = Bouncer.ability((user: User) => {
    // Pour l'instant, Admin seulement, mais on pourrait affiner pour les Modérateurs
     return CHECK_ROLES.isAdmin(user);
    // Alternative : vérifier permission 'themes:manage' du rôle Moderator
    // return CHECK_ROLES.isAdmin(user) || (isModerator(user) && await user.hasPermission('themes:manage'));
})

// Qui peut soumettre/créer un thème (potentiellement Créateur ou Admin)
export const createTheme = Bouncer.ability((user: User) => {
    return CHECK_ROLES.isCreatorRole(user) || CHECK_ROLES.isAdmin(user);
})

// Peut mettre à jour UN theme (Peut-être le Créateur pour SES thèmes?)
// Nécessite d'ajouter 'creatorId' au modèle Theme pour ça.
// Pour l'instant, on reprend manageThemes (seul Admin/Modo)
export const updateTheme = Bouncer.ability((user: User, /*theme: Theme*/) => {
    // Exemple si creatorId existe :
    // if (CHECK_ROLES.isAdmin(user)) return true;
    // if (CHECK_ROLES.isCreatorRole(user) && theme.creatorId === user.id) return true;
    // return false;
    return CHECK_ROLES.isManager(user); // Simplifié pour l'instant
})


// --- Abilities APIs (Définitions Globales) ---

// Peut gérer entièrement les définitions d'API (CRUD, défaut...)
export const manageApis = Bouncer.ability((user: User) => {
    // Admin seulement pour ces actions critiques
    return CHECK_ROLES.isAdmin(user);
})


// --- Abilities Actions Admin ---

// Peut accéder aux endpoints du AdminControlsController
export const performAdminActions = Bouncer.ability((user: User) => {
    // Pour l'instant, Admin et Modérateur peuvent voir/faire les actions
    // mais certaines devraient être limitées à l'Admin (ex: garbage collect delete)
    return CHECK_ROLES.isManager(user);
})

// Ability spécifique pour les actions dangereuses (Admin uniquement)
export const performDangerousAdminActions = Bouncer.ability((user: User) => {
    return CHECK_ROLES.isAdmin(user);
})


// --- Abilities Futures ---

// Peut voir son propre tableau de bord Affilié
export const viewAffiliateDashboard = Bouncer.ability((user: User) => {
    return CHECK_ROLES.isAffiliateRole(user) || CHECK_ROLES.isManager(user);
})

// Peut gérer son profil/infos bancaires Affilié
export const manageAffiliateProfile = Bouncer.ability((user: User) => {
    return CHECK_ROLES.isAffiliateRole(user) || CHECK_ROLES.isAdmin(user); // Admin peut aider
})

// Peut voir son propre tableau de bord Créateur
export const viewCreatorDashboard = Bouncer.ability((user: User) => {
    return CHECK_ROLES.isCreatorRole(user) || CHECK_ROLES.isManager(user);
})

// Peut gérer son profil public Créateur
export const manageCreatorProfile = Bouncer.ability((user: User) => {
    return CHECK_ROLES.isCreatorRole(user) || CHECK_ROLES.isAdmin(user);
})

// export const Abilities = {
// viewStoreList,
// viewStore,
// createStore,
// updateStore,
// deleteStore,
// manageStoreDomains,
// manageStoreTheme,
// manageStoreApi,
// manageStoreState,
// manageStoreActivation,
// manageThemes,
// createTheme,
// updateTheme,
// manageApis,
// performAdminActions,
// performDangerousAdminActions,
// viewAffiliateDashboard,
// manageAffiliateProfile,
// viewCreatorDashboard,
// manageCreatorProfile,
// } 