// app/controllers/http/auth_controller.ts
import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import User from '#models/user'
import Role, { ROLES } from '#models/role' // Importe ROLES
import hash from '@adonisjs/core/services/hash'
import { v4 } from 'uuid'
import JwtService from '#services/JwtService'
import logger from '@adonisjs/core/services/logger'
import db from '@adonisjs/lucid/services/db'
import UserAuthentification from '#models/user_authentification'
import MailService from '#services/MailService'
import env from '#start/env'
import EmailVerificationToken from '#models/email_verification_token'
import { DateTime } from 'luxon'
import { Infer } from '@vinejs/vine/types'
import AsyncConfirm, { AsyncConfirmType } from '#models/asyncConfirm'
import { Message } from '@adonisjs/mail'

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

    private resendSchema = vine.compile(
        vine.object({
            email: vine.string().trim().email().normalizeEmail(),
        })
    );

    private verifyEmailSchema = vine.compile(
        vine.object({
            token: vine.string().trim().minLength(10), // Token requis
        })
    );



    private forgotPasswordSchema = vine.compile(
        vine.object({
            email: vine.string().trim().email().normalizeEmail(),
            callback_url: vine.string().trim().minLength(3)
        })
    );

    private resetPasswordSchema = vine.compile(
        vine.object({
            token: vine.string().trim().minLength(10), // Le token brut reçu
            password: vine.string().minLength(8).confirmed(), // Nouveau mot de passe + confirmation
        })
    );

    private setupAccountSchema = vine.compile(
        vine.object({
            token: vine.string().trim().minLength(10), // Le token brut reçu de l'URL
            password: vine.string().minLength(8).confirmed(), // Nouveau mot de passe + confirmation
        })
    );



    private async sendVerificationEmail(user: User) {

        await EmailVerificationToken.query().where('user_id', user.id).delete();
        const tokenValue = 'email_' + v4()
        const expires_at = DateTime.now().plus({ hours: 24 });
        const verificationToken = await EmailVerificationToken.create({
            user_id: user.id, token: tokenValue, expires_at: expires_at,
        });

        logger.info({ user_id: user.id, tokenId: verificationToken.id }, 'Email verification token created');


        const verificationUrl = `server.${env.get('SERVER_DOMAINE')}/auth/verify-email?token=${tokenValue}`;
        try {
            await MailService.send({
                to: user.email,
                subject: 'Vérifiez votre adresse email - Sublymus',
                template: 'emails/verify_email', // Chemin relatif depuis 'resources/views/'
                context: {
                    userName: user.full_name,
                    verificationUrl: verificationUrl
                }
            });

            logger.info({ user_id: user.id, email: user.email }, 'S_server send Verification email');

        } catch (error) {
            logger.error({ user_id: user.id, error: error.message }, 'Failed to send verification email job');
            // Ne pas exposer l'erreur détaillée au client

        }
    }

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

        const trx = await db.transaction()
        // Créer l'utilisateur
        try {
            const user = await User.create({
                id: v4(),
                full_name: payload.full_name,
                email: payload.email,
                password: payload.password, 
                status: 'NEW', 
            });

            await UserAuthentification.create({
                id: v4(),
                user_id: user.id,
                provider: 'email',
                provider_id: user.email, 
            }, { client: trx });

            await this.sendVerificationEmail(user);

            return response.created({
                message:'Verifier votre email pour acceder au Dashboard'    
            });
        } catch (error) {
            await trx.rollback(); // Assurer rollback en cas d'erreur (même si sendVerificationEmail échoue après)
            logger.error({ email: payload.email, error: error.message, stack: error.stack }, 'Registration failed');
            // 🌍 i18n
            return response.internalServerError({
                message: 'auth.registerFailed', // Nouvelle clé
                error: error.message,
            });

        }
    }

    async verifyEmail({ request, response }: HttpContext) { // Pas d'auth ici
        let payload: { token: string }; // Type simple pour le token
        try {
            // ✅ Validation Vine (Query Params) - Le token est dans le query string
            payload = await this.verifyEmailSchema.validate(request.qs());
        } catch (error) {
            if (error.code === 'E_VALIDATION_ERROR') {
                // 🌍 i18n
                return response.badRequest({ message: ('validationFailed'), errors: error.messages });
            }
            throw error;
        }
        const tokenValue = payload.token;

        // --- Logique métier ---
        const verificationToken = await EmailVerificationToken.query()
            .where('token', tokenValue)
            .preload('user')
            .first();

        if (!verificationToken || verificationToken.expires_at < DateTime.now()) {
            logger.warn({ token: tokenValue }, 'Invalid or expired email verification token used');
            // 🌍 i18n
            return response.badRequest({ message: ('auth.invalidOrExpiredToken') }); // Nouvelle clé
        }

        const user = verificationToken.user;
        if (!user) {
            logger.error({ tokenId: verificationToken.id, tokenValue }, "Verification token found but associated user does not exist.");
            await verificationToken.delete(); // Nettoyer le token orphelin
            // 🌍 i18n
            return response.badRequest({ message: ('auth.invalidOrExpiredToken') }); // Message générique
        }


        if (user.isEmailVerified) {
            logger.info({ user_id: user.id }, 'Email already verified');
            await verificationToken.delete();
            // 🌍 i18n
            return response.ok({ message: ('auth.emailAlreadyVerified') }); // Nouvelle clé
        }

        const trx = await db.transaction(); // Transaction pour MAJ user + delete token
        try {
            user.useTransaction(trx);
            user.email_verified_at = DateTime.now();
            await user.save();
            await verificationToken.useTransaction(trx).delete();
            await trx.commit();

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

            logger.info({ user_id: user.id }, 'Email successfully verified');
            // 🌍 i18n
            return  response.redirect(`http${env.get('NODE_ENV')=='production'?'s':''}://dash.${env.get('SERVER_DOMAINE')}?token=${token}`) // Nouvelle clé

        } catch (error) {
            await trx.rollback();
            logger.error({ user_id: user.id, error: error.message, stack: error.stack }, 'Failed to update user verification status');
            // 🌍 i18n
            return response.internalServerError({ message: ('auth.emailVerificationFailedDb') }); // Nouvelle clé
        }
    }

    async resendVerification({ request, response }: HttpContext) { // Pas d'auth ici
        let payload: Infer<typeof this.resendSchema>;
        try {
            // ✅ Validation Vine (Body)
            payload = await this.resendSchema.validate(request.body());
        } catch (error) {
            if (error.code === 'E_VALIDATION_ERROR') {
                // 🌍 i18n
                return response.unprocessableEntity({ message: ('validationFailed'), errors: error.messages });
            }
            throw error;
        }
        const email = payload.email;

        // --- Logique métier ---
        const user = await User.findBy('email', email);

        // Message générique pour la sécurité (ne pas révéler si l'email existe)
        const genericMessage = ('auth.resendGenericResponse'); // Nouvelle clé

        if (!user || user.isEmailVerified) {
            if (!user) {
                logger.info({ email }, 'Resend verification attempt for non-existent email');
            } else {
                logger.info({ user_id: user.id }, 'Resend verification attempt for already verified email');
            }
            return response.ok({ message: genericMessage });
        }

        try {
            await this.sendVerificationEmail(user); // Renvoi l'email
            return response.ok({ message: genericMessage });
        } catch (error) {
            // sendVerificationEmail logue déjà l'erreur interne
            // 🌍 i18n (Message générique même en cas d'erreur interne pour sécurité)
            return response.ok({ message: genericMessage });
            // Ou retourner une erreur 500 si on préfère indiquer un problème serveur
            // return response.internalServerError({ message: ('auth.resendFailedInternal') });
        }
    }

    /**
* @forgotPassword
* Initiates the password reset process for a user.
* Finds user by email, generates a reset token, stores its hash, and sends reset email.
*/
    async forgotPassword({ request, response }: HttpContext) {
        let payload: Infer<typeof this.forgotPasswordSchema>;
        try {
            // ✅ Validation Vine
            payload = await this.forgotPasswordSchema.validate(request.body());
        } catch (error) {
            if (error.code === 'E_VALIDATION_ERROR') {
                // 🌍 i18n
                return response.unprocessableEntity({ message: ('validationFailed'), errors: error.messages });
            }
            // Logguer mais ne pas relancer pour masquer l'erreur
            logger.error({ error }, "Forgot password validation failed");
            // 🌍 i18n - Réponse générique pour la sécurité
            return response.ok({ message: ('auth.forgotPassword.emailSentConfirmation') });
        }

        const email = payload.email;
        const genericSuccessMessage = { message: ('auth.forgotPassword.emailSentConfirmation') };

        try {
            // --- Logique métier ---
            const user = await User.findBy('email', email);

            // **Sécurité** : Ne pas révéler si l'email existe.
            if (!user) {
                logger.info({ email }, "Password reset requested for non-existent email.");
                return response.ok(genericSuccessMessage); // Toujours retourner succès
            }

            // Empêcher reset pour emails non vérifiés ? (Optionnel mais recommandé)
            if (!user.isEmailVerified) {
                logger.warn({ userId: user.id, email }, "Password reset requested for unverified email.");
                return response.ok(genericSuccessMessage);
            }

            // Invalider les anciens tokens de reset pour cet utilisateur
            //TODO invalider ou supprimer // je pense qu'il vaut mieux suprimer
            await AsyncConfirm.query()
                .where('userId', user.id)
                .where('type', AsyncConfirmType.PASSWORD_RESET)
                .update({ usedAt: DateTime.now() }); // Marquer comme utilisés

            // Générer token BRUT et HASH
            const tokenBrut = 'pass_reset_' + v4() // Token à envoyer par email
            const tokenHash = await hash.make(tokenBrut); // Hash à stocker
            const expiresAt = DateTime.now().plus({ hours: 1 }); // Durée de vie courte (1h)

            // Stocker le nouveau token hashé dans async_confirms
            await AsyncConfirm.create({
                userId: user.id,
                tokenHash: tokenHash,
                type: AsyncConfirmType.PASSWORD_RESET,
                expiresAt: expiresAt,
            });
            logger.info({ userId: user.id }, "Password reset token created");

            // Construire l'URL de réinitialisation (côté frontend)
            // Assurer que APP_FRONTEND_URL est définie dans .env
            const resetUrl = `${payload.callback_url}?token=${tokenBrut}`;

            // Envoyer le job d'email via BullMQ
            try {

                await MailService.send({
                    to: user.email,
                    subject: ('Restoration du Mot de Passe SUBLYMUS'), // Nouvelle clé
                    template: 'emails/password_reset', // Chemin relatif depuis 'resources/views/'
                    context: {
                        userName: user.full_name,
                        resetUrl: resetUrl
                    }
                });

                logger.info({ userId: user.id }, "Password reset email job sent to s_server");
            } catch (queueError) {
                logger.error({ userId: user.id, error: queueError.message }, 'Failed to send password reset email job');
                // Ne pas faire échouer la requête user à cause de ça, retourner succès quand même
            }

            // Toujours retourner le message de succès générique
            return response.ok(genericSuccessMessage);

        } catch (error) {
            logger.error({ email, error: error.message, stack: error.stack }, 'Forgot password process failed internally');
            // 🌍 i18n - Réponse générique même en cas d'erreur interne
            return response.ok(genericSuccessMessage); // Ou 500 si on veut indiquer un problème serveur
            // return response.internalServerError({ message: ('auth.forgotPassword.genericError') });
        }
    }



    /**
     * @resetPassword
     * Resets the user's password using a valid token.
     */
    async resetPassword({ request, response }: HttpContext) {
        let payload: Infer<typeof this.resetPasswordSchema>;
        try {
            // ✅ Validation Vine
            payload = await this.resetPasswordSchema.validate(request.body());
        } catch (error) {
            if (error.code === 'E_VALIDATION_ERROR') {
                // 🌍 i18n
                return response.unprocessableEntity({ message: ('validationFailed'), errors: error.messages });
            }
            throw error;
        }

        const { token: tokenBrut, password } = payload;

        // --- Logique métier ---
        // Variable pour stocker l'enregistrement AsyncConfirm trouvé
        let validTokenRecord: AsyncConfirm | null = null;

        try {
            // 1. Trouver TOUS les tokens potentiels non utilisés/non expirés pour ce type
            // On ne peut pas chercher par hash directement de manière performante sans extension DB
            // Solution: chercher les tokens récents non utilisés et vérifier le hash en mémoire
            const potentialTokens = await AsyncConfirm.query()
                .where('type', AsyncConfirmType.PASSWORD_RESET)
                .whereNull('usedAt')
                .where('expiresAt', '>', DateTime.now().toISO()) // Seulement les non expirés
                .orderBy('createdAt', 'desc'); // Commencer par les plus récents

            // 2. Vérifier chaque token potentiel
            for (const tokenRecord of potentialTokens) {
                if (await hash.verify(tokenRecord.tokenHash, tokenBrut)) {
                    // Correspondance trouvée !
                    validTokenRecord = tokenRecord;
                    break; // Sortir de la boucle
                }
            }

            // 3. Vérifier si un token valide a été trouvé
            if (!validTokenRecord) {
                logger.warn({ tokenHint: tokenBrut.substring(0, 5) }, "Invalid or expired password reset token provided");
                // 🌍 i18n
                return response.badRequest({ message: ('auth.resetPassword.invalidToken') });
            }

            // 4. Token valide trouvé, procéder à la mise à jour
            const user = await User.find(validTokenRecord.userId); // Récupérer l'utilisateur associé
            if (!user) {
                // Cas très rare où l'utilisateur a été supprimé entre temps
                logger.error({ userId: validTokenRecord.userId, tokenId: validTokenRecord.id }, "User associated with valid password reset token not found.");
                await validTokenRecord.markAsUsed(); // Invalider le token quand même
                // 🌍 i18n
                return response.badRequest({ message: ('auth.resetPassword.invalidToken') }); // Message générique
            }

            // Utiliser une transaction pour la mise à jour du mot de passe et l'invalidation du token
            const trx = await db.transaction();
            try {
                // 5. Mettre à jour le mot de passe (le hook User s'occupe du hash)
                user.useTransaction(trx);
                user.password = password;
                await user.save();

                // 6. Marquer le token comme utilisé
                validTokenRecord.useTransaction(trx);
                await validTokenRecord.markAsUsed();

                // 7. (Optionnel) Supprimer tous les autres tokens API actifs pour cet utilisateur

                logger.info({ userId: user.id }, "Deleted active API tokens after password reset.");

                await trx.commit(); // Valider la transaction

                logger.info({ userId: user.id }, "Password reset successfully");
                // 🌍 i18n
                return response.ok({ message: ('auth.resetPassword.success') });

            } catch (dbError) {
                await trx.rollback();
                logger.error({ userId: user.id, tokenId: validTokenRecord.id, error: dbError.message }, "Database error during password reset update");
                throw dbError; // Relancer pour erreur 500
            }

        } catch (error) {
            logger.error({ tokenHint: tokenBrut.substring(0, 5), error: error.message, stack: error.stack }, 'Password reset process failed');
            // 🌍 i18n
            return response.internalServerError({ message: ('auth.resetPassword.genericError'), error: error.message }); // Nouvelle clé
        }
    }

    async setupAccount({ request, response }: HttpContext) {
        // Pas besoin d'auth ici, l'accès est basé sur le token

        let payload: Infer<typeof this.setupAccountSchema>;
        try {
            // ✅ Validation Vine
            payload = await this.setupAccountSchema.validate(request.body());
        } catch (error) {
            if (error.code === 'E_VALIDATION_ERROR') {
                // 🌍 i18n
                return response.unprocessableEntity({ message: ('validationFailed'), errors: error.messages });
            }
            // Logguer erreur inattendue
            logger.error({ error }, "Setup account validation failed");
            throw error; // Relancer pour 500
        }

        const { token: tokenBrut, password } = payload;

        // --- Logique métier ---
        // Variable pour stocker l'enregistrement AsyncConfirm trouvé
        let validTokenRecord: AsyncConfirm | null = null;

        try {
            // 1. Trouver TOUS les tokens potentiels non utilisés/non expirés pour ce type
            const potentialTokens = await AsyncConfirm.query()
                .where('type', AsyncConfirmType.ACCOUNT_SETUP) // ✅ Utiliser le bon type
                .whereNull('usedAt')
                .where('expiresAt', '>', DateTime.now().toISO())
                .orderBy('createdAt', 'desc');

            // 2. Vérifier chaque token potentiel avec le hash
            for (const tokenRecord of potentialTokens) {
                if (await hash.verify(tokenRecord.tokenHash, tokenBrut)) {
                    validTokenRecord = tokenRecord;
                    await validTokenRecord.load('user'); // ✅ Précharger l'utilisateur associé
                    break;
                }
            }

            // 3. Vérifier si un token valide et un utilisateur associé ont été trouvés
            if (!validTokenRecord || !validTokenRecord.user) {
                logger.warn({ tokenHint: tokenBrut.substring(0, 5) }, "Invalid, expired, used, or userless account setup token provided");
                // 🌍 i18n
                return response.badRequest({ message: ('auth.setupAccount.invalidToken') }); // Nouvelle clé
            }

            // 4. Token valide trouvé, procéder à la mise à jour
            const user = validTokenRecord.user;

            // Vérifier si le compte n'est pas déjà actif (double sécurité)
            if (user.email_verified_at) {
                logger.warn({ userId: user.id }, "Account setup attempted for already verified user.");
                await validTokenRecord.markAsUsed(); // Invalider le token quand même
                // 🌍 i18n
                return response.badRequest({ message: ('auth.setupAccount.alreadyActive') }); // Nouvelle clé
            }


            const trx = await db.transaction();
            try {
                // 5. Mettre à jour le mot de passe
                user.useTransaction(trx);
                user.password = password; // Hashage géré par hook User

                // 6. Marquer l'email comme vérifié
                user.email_verified_at = DateTime.now();

                await user.save();

                // 7. Marquer le token comme utilisé
                validTokenRecord.useTransaction(trx);
                await validTokenRecord.markAsUsed();

                await trx.commit();

                logger.info({ userId: user.id }, "Collaborator account setup successfully");
                // 🌍 i18n
                // Retourner succès, le frontend redirigera vers login
                return response.ok({ message: ('auth.setupAccount.success') });

            } catch (dbError) {
                await trx.rollback();
                logger.error({ userId: user.id, tokenId: validTokenRecord.id, error: dbError.message }, "Database error during account setup update");
                throw dbError; // Relancer pour erreur 500
            }

        } catch (error) {
            logger.error({ tokenHint: tokenBrut.substring(0, 5), error: error.message, stack: error.stack }, 'Account setup process failed');
            // 🌍 i18n
            return response.internalServerError({ message: ('auth.setupAccount.genericError'), error: error.message }); // Nouvelle clé
        }
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

        if (!user.isEmailVerified) {
            logger.warn({ user_id: user.id, email: user.email }, 'Login attempt with unverified email');
            try {
                // Tenter de renvoyer l'email si non vérifié
                const minut = 1 * 60 * 1000
                const verifier = await EmailVerificationToken.query().where('user_id', user.id).where('expires_at', '>', DateTime.fromMillis(Date.now() + 20 * minut).toISO() || '').first();
                if (!verifier) {
                    await this.sendVerificationEmail(user);
                }
            } catch (sendError) {
                logger.error({ userId: user.id, error: sendError }, "Failed to resend verification email during login attempt");
            }
            // 🌍 i18n
            return response.unauthorized({
                code: 'E_EMAIL_NOT_VERIFIED',
                // message: ('auth.emailNotVerified') // Nouvelle clé
                message: 'Verifier votre boite email' // Nouvelle clé
            });
        }
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
            if (googleUser.avatarUrl && (!user.photo || !user.photo.includes(googleUser.avatarUrl))) {
                user.photo = [googleUser.avatarUrl, ...(user.photo ?? [])];
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
        // return response.redirec('/'); // Rediriger vers le dashboard

        // PAS de redirection via HTML/JS ici pour une API
    }

} // Fin AuthController