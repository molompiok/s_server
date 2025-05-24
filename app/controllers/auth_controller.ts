// app/controllers/http/auth_controller.ts
import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import User from '#models/user'
import Role, { ROLES } from '#models/role' // Importe ROLES
import hash from '@adonisjs/core/services/hash'
import { v4 } from 'uuid'
import JwtService from '#services/JwtService'

export default class AuthController {

    // --- Validateurs ---
    static registerValidator = vine.compile(
        vine.object({
            full_name: vine.string().trim().minLength(2), // renommé depuis name?
            email: vine.string().trim().email(),
            // Regex pour mot de passe (exemple : min 8 cars, 1 maj, 1 min, 1 chiffre)
            password: vine.string().minLength(8).confirmed()
                // .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/),

            /*
                            TODO  : la page d'inscription doit montrer ces differentes condition a respecter.. 
                            
                            Doit contenir au moins une lettre minuscule
                            (?=.*[A-Z])	Doit contenir au moins une lettre majuscule
                            (?=.*\d)	Doit contenir au moins un chiffre
                            .+$	Doit contenir au moins un caractère (en pratique, tout est déjà validé par minLength(8))
            */
        })
    )

    static loginValidator = vine.compile(
        vine.object({
            email: vine.string().trim().email(),
            password: vine.string(),
        })
    )

    // --- Méthodes ---

    /**
     * Enregistre un nouvel utilisateur (OWNER par défaut)
     * POST /auth/register
     */
    async register({ request, response }: HttpContext) {
        const payload = await request.validateUsing(AuthController.registerValidator);

        // Vérifier si l'email existe déjà
        const existingUser = await User.findBy('email', payload.email);
        if (existingUser) {
            return response.conflict({ message: 'Cet email est déjà utilisé.' });
        }

        // Créer l'utilisateur
        const user = new User();
        user.fill({
            id: v4(),
            full_name: payload.full_name,
            email: payload.email,
            password: payload.password, // Sera hashé par le hook beforeSave
            status: 'VISIBLE', // Ou 'NEW' si une validation email est requise?
        });

        // Récupérer le rôle OWNER (suppose qu'il existe et est seedé)
        // const ownerRole = await Role.findBy('name', ROLES.OWNER);
        // if (!ownerRole) {
        //     console.error("ERREUR CRITIQUE: Rôle OWNER non trouvé dans la BDD. Lancez les seeders.");
        //     return response.internalServerError({ message: "Erreur configuration serveur." });
        // }

        await user.save(); // Sauvegarde l'utilisateur (le hook hash le mdp)

        // Attache le rôle OWNER à l'utilisateur (relation ManyToMany)
        // await user.related('roles').attach([ownerRole.id]);

        // Génère un token d'accès pour connecter l'utilisateur automatiquement
        // Utilise une méthode sûre pour créer le token (qui le hashe)
        // const token = await User.accessTokens.create(user, ['*'], { // Donne toutes capacités '*' ici
        //     // name: 'registration_token', // Nom optionnel pour le token
        //     expiresIn: '7 days' // Donne un token un peu plus court pour l'enregistrement ?
        // });

        // Charge les rôles pour les inclure dans la réponse
        await user.load('roles');

        const token = JwtService.sign({
            userId:user.id,
            email: user.email
        }, {
            subject: user.id,
            issuer: 'https://server.sublymus.com', // Ton issuer
            audience: 'https://dash.sublymus.com', // Ton audience
            expiresIn: '7d', // Durée de validité
        });
        return response.created({
            user: user.serialize({ fields: { omit: ['password'] } }),
            type: 'bearer',
            token, // !! Important: .release() donne le token en clair UNE SEULE FOIS !!
            // Optionnel : expiresIn calculé en timestamp
            // expires_at: token.expiresAt ? token.expiresAt.toISOString() : null,
        });
    }


    /**
     * Connecte un utilisateur avec email/password et retourne un Bearer Token
     * POST /auth/login
     */
    async login({ request, response }: HttpContext) {
        const { email, password } = await request.validateUsing(AuthController.loginValidator);

        // 1. Trouver l'utilisateur
        const user = await User.findBy('email', email);
        if (!user) {
            return response.unauthorized({ message: 'Email ou mot de passe invalide.' });
        }

        // 2. Vérifier le mot de passe
        if (!(await hash.verify(user.password, password))) {
            return response.unauthorized({ message: 'Email ou mot de passe invalide.' });
        }

        // 3. Vérifier si le compte est actif (optionnel mais recommandé)
        // if (user.status !== 'VISIBLE') {
        //     return response.forbidden({ message: 'Compte inactif ou suspendu.'});
        // }

        // 4. Générer un nouveau token d'accès
        // On peut ajouter des capacités spécifiques ici si besoin
        // const token = await User.accessTokens.create(user, ['*'], { // Ou capacités plus fines
        //     name: `login_token_${DateTime.now().toFormat('yyyyMMdd_HHmmss')}`, // Pour tracking
        //     expiresIn: '30 days' // Ou depuis la config User.accessTokens
        // });

        // 5. Charger les rôles pour les inclure
        await user.load('roles');

        const userPayload = {
            userId: user.id,
            email: user.email,
            // roles_globaux: ['OWNER'] // Si applicable
        };

        const token = JwtService.sign(userPayload, {
            subject: user.id,
            issuer: 'https://server.sublymus.com', // Ton issuer
            // audience: 'https://dash.sublymus.com', // Ton audience
            expiresIn: '30d', // Durée de validité
        });


        // 6. Retourner la réponse avec le token
        return response.ok({
            token,
            user: user.serialize({ fields: { omit: ['password'] } }),
            type: 'bearer',
            // token: token.value!.release(), // Ne pas oublier release()!
            // expires_at: token.expiresAt ? token.expiresAt.toISOString() : null,
        });
    }



    /**
     * Déconnecte l'utilisateur en supprimant le token utilisé pour la requête.
     * POST /auth/logout (nécessite d'être authentifié avec le token)
     */
    async logout({ auth, response }: HttpContext) {
        await auth.use('jwt').logout();
        return response.ok({ message: 'Déconnexion réussie.' });
    }


    /**
     * Retourne les informations de l'utilisateur connecté
     * GET /auth/me (protégé par le middleware auth)
     */
    async me({ auth, response }: HttpContext) {
        // auth.user est déjà chargé par le middleware (auth et initializeBouncer)
        const user = await auth.authenticate(); // Renvoie erreur si non connecté

        await user.load('roles');

        return response.ok({
            user: user.serialize({ fields: { omit: ['password'] } }),
            roles: user.roles.map(r => r.name), // Peut-être juste les noms?
        });
    }


    // --- Google OAuth (Adapté pour Tokens) ---

    // GET /auth/google/redirect
    async google_redirect({ ally }: HttpContext) {
        // Redirige vers Google pour authentification
        return ally.use('google').redirect((request) => {
            // Optionnel: définir les scopes Google nécessaire
            request.scopes(['openid', 'profile', 'email'])
        });
    }

    // GET /auth/google/callback
    async google_callback({ ally, response }: HttpContext) {
        const google = ally.use('google');

        // Gérer les erreurs potentielles de Google
        if (google.accessDenied()) return response.badRequest("Accès refusé par Google.");
        if (google.stateMisMatch()) return response.badRequest("Requête invalide ou expirée.");
        if (google.hasError()) {
            console.error("Erreur OAuth Google:", google.getError());
            return response.badRequest(`Erreur Google: ${google.getError()}`);
        }

        // Récupérer les infos utilisateur de Google
        const googleUser = await google.user();
        if (!googleUser.email) {
            return response.badRequest("L'email Google n'a pas pu être récupéré.");
        }

        // Chercher ou créer l'utilisateur local
        let user = await User.query().where('email', googleUser.email).first();

        // Lier le compte social à l'utilisateur
        // Utilise findOrCreate pour éviter les erreurs si déjà lié
        if (!user) {
            // Si l'utilisateur n'existe PAS localement, on le crée
            user = new User();
            user.fill({
                full_name: googleUser.name,
                email: googleUser.email,
                // Pas de mot de passe local nécessaire si login via Google uniquement
                // On pourrait générer un mdp aléatoire ou laisser null selon la stratégie
                password: v4(), // Exemple MDP aléatoire
                status: 'VISIBLE',
                // Utilise l'avatar Google (assure-toi que `photos` est bien `string[]`)
                photos: googleUser.avatarUrl ? [googleUser.avatarUrl] : [],
            });
            await user.save();
            // Assigner le rôle OWNER par défaut au nouvel utilisateur Google
            const ownerRole = await Role.findByOrFail('name', ROLES.OWNER);
            await user.related('roles').attach([ownerRole.id]);
        } else {
            // Si l'utilisateur existe déjà, on pourrait vouloir mettre à jour son avatar/nom?
            user.full_name = googleUser.name;
            if (googleUser.avatarUrl && (!user.photos || !user.photos.includes(googleUser.avatarUrl))) {
                user.photos = [googleUser.avatarUrl, ...(user.photos ?? [])];
            }

            await user.save();
        }


        // Créer ou Mettre à jour la liaison compte social
        // token, refreshToken, expiresAt sont pour l'API Google, pas notre Token d'accès
        /*await user.related('socialAccounts').updateOrCreate(
            { // Critères de recherche
                provider: 'google',
                providerId: googleUser.id,
            },
            { // Données à insérer/MAJ
                provider: 'google',
                providerId: googleUser.id,
                // Stocker le token Google? Optionnel, utile si on doit faire des appels API Google plus tard
                // providerToken: googleUser.token.token,
                // providerRefreshToken: googleUser.token.refreshToken,
                // providerExpiresAt: googleUser.token.expiresAt ? DateTime.fromMillis(googleUser.token.expiresAt) : null
            }
        );
*/
        // Générer NOTRE token d'accès pour NOTRE API
        const token = await User.accessTokens.create(user, ['*'], {
            name: 'google_login_token',
            expiresIn: '30 days'
        });

        await user.load('roles'); // Charger rôles pour réponse

        // Réponse pour API/SPA : retourner un JSON avec le token
        return response.ok({
            message: "Connecté avec succès via Google",
            user: user.serialize({ fields: { omit: ['password'] } }),
            type: 'bearer',
            token: token.value!.release(),
            expires_at: token.expiresAt ? token.expiresAt.toISOString() : null,
        });

        // SI C'ETAIT UNE APP WEB AVEC SESSIONS :
        // await auth.use('web').login(user);
        // return response.redirect('/'); // Rediriger vers le dashboard

        // PAS de redirection via HTML/JS ici pour une API
    }

} // Fin AuthController