// app/controllers/http/users_controller.ts
import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import User from '#models/user'
import hash from '@adonisjs/core/services/hash'
import Store from '#models/store'
import StoreService from '#services/StoreService'
// Importe les helpers de gestion de fichiers si tu les utilises ici
// import { updateFiles } from './Tools/FileManager/UpdateFiles.js' // Chemin à adapter

export default class UsersController {

    // --- Validateurs ---

    static updateProfileValidator = vine.compile(
        vine.object({
            fullName: vine.string().trim().minLength(2).optional(),
            phone: vine.string().trim().nullable().optional(), // Accepte string ou null
            // Les 'photos' seraient gérées séparément si upload, ou ici si URL
            // photos: vine.array(vine.string().url()).optional() // Si on passe un tableau d'URLs
        })
    )

    // Validateur si on permet de changer le mot de passe depuis le profil
    static updatePasswordValidator = vine.compile(
        vine.object({
            currentPassword: vine.string(), // L'utilisateur doit fournir l'ancien
            newPassword: vine.string().minLength(8).confirmed()
                .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/),
        })
    )

    // --- Méthodes du Contrôleur ---

    /**
     * Met à jour le profil de l'utilisateur connecté.
     * PUT /auth/me  (Ou PUT /users/me, si on change la route)
     */
    async updateMe({ request, response, auth }: HttpContext) {
        const user = auth.getUserOrFail(); // L'utilisateur est déjà authentifié par le middleware

        // 1. Validation des données du profil (hors mot de passe, photos upload)
        const payload = await request.validateUsing(UsersController.updateProfileValidator);

        // Applique les mises à jour simples
        let hasChanges = false;
        if (payload.fullName && payload.fullName !== user.full_name) {
            user.full_name = payload.fullName;
            hasChanges = true;
        }
        if (payload.phone !== undefined && payload.phone !== user.phone) {
            user.phone = payload.phone; // Peut être string ou null
            hasChanges = true;
        }

        // --- GESTION DES PHOTOS (si tu l'intègres ici) ---
        // Exemple si on reçoit des URLS ou qu'on gère l'upload ici
        // C'est souvent mieux dans un endpoint dédié (/me/avatar par exemple)
        /*
        const uploadedPhotos = []; // Remplacer par la logique d'upload de ton service File
        if (uploadedPhotos.length > 0) {
            // Logique pour remplacer ou ajouter aux photos existantes
            user.photos = uploadedPhotos;
            hasChanges = true;
        }
        */

        // 2. Sauvegarde si des changements ont eu lieu
        if (hasChanges) {
            try {
                await user.save();
                // Doit-on recharger les rôles ici ? Probablement pas pour un update de profil
                // await user.load('roles');
            } catch (error) {
                console.error("Erreur sauvegarde profil user:", error);
                return response.internalServerError({ message: "Erreur lors de la sauvegarde du profil." });
            }
        } else {
            // Si aucun changement détecté, retourne 200 OK avec les données actuelles
        }

        // Recharger les rôles avant de renvoyer, au cas où
        await user.load('roles');
        return response.ok({
            user: user.serialize({ fields: { omit: ['password'] } })
        });
    }


    /**
     * Permet à l'utilisateur connecté de changer son mot de passe.
     * PUT /auth/me/password (Nouvelle route suggérée)
     */
    async updateMyPassword({ request, response, auth }: HttpContext) {
        const user = auth.getUserOrFail();

        // Validation (ancien mot de passe, nouveau + confirmation)
        const payload = await request.validateUsing(UsersController.updatePasswordValidator);

        // Vérifier l'ancien mot de passe
        if (!(await hash.verify(user.password, payload.currentPassword))) {
            // Pour des raisons de sécurité, on ne dit pas *exactement* ce qui est faux
            return response.badRequest({ message: 'Mot de passe actuel incorrect.' });
            // OU (plus spécifique mais moins sûr)
            // return response.badRequest({
            //    errors: [{ field: 'currentPassword', rule: 'invalid', message: 'Mot de passe actuel incorrect.' }]
            // });
        }

        // Mettre à jour avec le nouveau mot de passe (le hook beforeSave s'occupera du hash)
        user.password = payload.newPassword;
        try {
            await user.save();
        } catch (error) {
            console.error("Erreur changement mot de passe:", error);
            return response.internalServerError({ message: "Erreur lors de la mise à jour du mot de passe." });
        }

        // Peut-être déconnecter toutes les autres sessions/tokens après changement de mdp?
        // await User.accessTokens.deleteAll(user);

        return response.ok({ message: 'Mot de passe mis à jour avec succès.' });
    }

    /**
     * Supprime le compte de l'utilisateur connecté.
     * **ACTION DESTRUCTIVE**
     * DELETE /auth/me (Ou DELETE /users/me)
     */
    async deleteMe({ response, auth }: HttpContext) {
        const user = auth.getUserOrFail();

        // !! LOGIQUE IMPORTANTE DE NETTOYAGE !!
        // Que faire des ressources liées à l'utilisateur ?
        // - Stores : Les supprimer ? Les désactiver ? Les transférer ? => Utilise StoreService?
        // - Thèmes créés : Les supprimer ? Les garder anonymes ?
        // - Affiliations : Clôturer ?
        // - Supprimer les tokens, les infos de profil, etc.

        // Exemple Simplifié: On supprime juste l'utilisateur, les cascades BDD feront le reste
        // MAIS CE N'EST PAS ASSEZ, il faut gérer les services externes (Swarm, Nginx...) !
        try {
            console.warn(`Demande de suppression du compte utilisateur ${user.id} (${user.email})`);

            // *** ETAPE CRUCIALE : Itérer sur les stores possédés et les supprimer proprement ***
            const storesOwned = await Store.query().where('user_id', user.id);
            console.log(`   -> Trouvé ${storesOwned.length} store(s) à supprimer...`);
            for (const store of storesOwned) {
                console.log(`   -> Suppression du store ${store.id}...`);
                // Utilise le service pour un cleanup complet (Swarm, Nginx, DB...)
                await StoreService.deleteStoreAndCleanup(store.id);
                console.log(`   -> Store ${store.id} supprimé.`);
            }

            // Supprimer tous les tokens d'accès restants
            const tokens = await User.accessTokens.all(user);
            for (const token of tokens) {
                await User.accessTokens.delete(user, token.identifier);
            }

            // Supprimer l'utilisateur (les cascades BDD devraient gérer user_roles, social_accounts)
            await user.delete();

            console.log(`   -> Utilisateur ${user.id} supprimé de la BDD.`);

            return response.noContent(); // Succès

        } catch (error) {
            console.error(`Erreur lors de la suppression du compte ${user.id}:`, error);
            // Tenter de donner une erreur un peu plus utile si possible
            return response.internalServerError({ message: "Erreur lors de la suppression du compte. Veuillez contacter le support." });
        }
    }


    /**
     * Déconnecte l'utilisateur de tous les appareils en supprimant tous ses tokens.
     * POST /auth/logout-all
     */
   
    public async logoutAllDevices({ auth, response }: HttpContext) {

        const user = await auth.authenticate();

        const tokens = await User.accessTokens.all(user);
        for (const token of tokens) {
            await User.accessTokens.delete(user, token.identifier);
        }

        return response.ok({ message: 'Déconnexion de tous les appareils réussie.' });
    }
    public async get_all_users({ auth, request, response }: HttpContext) {
         await auth.authenticate();

        const { page,limit , /*user_id,order_by, name, email,phone*/} = request.qs()
        
        let query = User.query().select('*');
        
        const users = await query.paginate(page||1,limit||10);

        return response.ok({ users:{
            list:users.all(),
            meta:users.getMeta()
        }, message: 'Déconnexion de tous les appareils réussie.' });
    }

} // Fin UsersController