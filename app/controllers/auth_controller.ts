// app/controllers/http/auth_controller.ts
import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import User from '#models/user'
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
import { redirectWithHtml } from '../Utils/HTML-RESPONSE.js'
import { devIp, isProd } from '../Utils/functions.js'
import Store from '#models/store'
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

        const verificationUrl = `server.${env.get('SERVER_DOMAINE')}/auth/verify-email?token=${tokenValue}`;

        logger.info({
            verificationUrl,
            user_id: user.id,
            tokenId: verificationToken.id
        },
            'Email verification token created'
        )

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
                message: 'Verifier votre email pour acceder au Dashboard'
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
            return response.redirect(`http${env.get('NODE_ENV') == 'production' ? 's' : ''}://dash.${env.get('SERVER_DOMAINE')}/auth/login?token=${token}`) // Nouvelle clé

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
            // if (!user.isEmailVerified) {
            //     logger.warn({ userId: user.id, email }, "Password reset requested for unverified email.");
            //     return response.ok(genericSuccessMessage);
            // }

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
            const resetUrl = `${payload.callback_url || `${isProd ? 'https://' : 'http://'}dash.${env.get('SERVER_DOMAINE')}/auth/reset-password`}?token=${tokenBrut}`;
            console.log({ resetUrl });

            // Envoyer le job d'email via BullMQ
            try {

                await MailService.send({
                    to: user.email,
                    subject: ('Restoration du Mot de Passe SUBLYMUS'), // Nouvelle clé
                    template: 'emails/password_reset', // Chemin relatif depuis 'resources/views/'
                    context: {
                        userName: user.full_name,
                        resetUrl
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
                user.email_verified_at = DateTime.now();
                await user.save();

                // 6. Marquer le token comme utilisé
                validTokenRecord.useTransaction(trx);
                await validTokenRecord.markAsUsed();

                // 7. (Optionnel) Supprimer tous les autres tokens API actifs pour cet utilisateur

                logger.info({ userId: user.id }, "Deleted active API tokens after password reset.");

                await trx.commit(); // Valider la transaction

                logger.info({ userId: user.id }, "Password reset successfully");

                await user.load('roles');

                const userPayload = {
                    userId: user.id,
                    email: user.email,
                };

                const token = JwtService.sign(userPayload, {
                    subject: user.id,
                    issuer: 'https://server.sublymus.com', // Ton issuer
                    expiresIn: '30d', // Durée de validité
                });


                // 6. Retourner la réponse avec le token
                return response.ok({
                    token,
                    user: user.serialize({ fields: { omit: ['password'] } }),
                    type: 'bearer',
                });

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
    async google_redirect({ request, response, ally }: HttpContext) {
        const clientSuccess = request.input('client_success')
        const clientError = request.input('client_error')


        if (!clientSuccess) {
            logger.warn({ query: request.qs() }, `Missing or invalid client_success for Google redirect`)
            return response.badRequest(` (client_success) manquant ou invalide.  \n Ex: ${env.get('SERVER_DOMAINE')}/auth/google/redirect?store_id=xxx&client_success=http://xxx/login-success&client_error=http://xxx/login-error`)
        }

        if (!clientError) {
            logger.warn({ query: request.qs() }, `Missing or invalid client_error for Google redirect`)
            return response.badRequest(`(client_error) manquant ou invalide. \n Ex: ${env.get('SERVER_DOMAINE')}/auth/google/redirect?store_id=xxx&client_success=http://xxx/login-success&client_error=http://xxx/login-error`)
        }

        const state = JSON.stringify({ clientSuccess, clientError })

        try {
            const google = ally.use('google').stateless()

            return google.redirect((request) => {
                request.param('state', state)
            })
        } catch (error) {
            logger.error({ error: error.message }, 'Failed to generate Google redirect URL')
            return response.internalServerError('Impossible de démarrer l\'authentification Google.')
        }
    }

    async storeAuthFromGoogle({  profile, data:{clientError,clientSuccess,storeId} }: {
        profile: {
            provider: string
            providerId: string
            email: string
            fullName: string
            avatarUrl: string
        },
        data: {
            storeId: string,
            clientSuccess: string,
            clientError: string,
        }

    }) {
        try {
            // 4. Préparer l'appel HTTP interne vers s_api (inchangé)
            const internalApiSecret = env.get('INTERNAL_API_SECRET');
            if (!internalApiSecret) {
                logger.fatal({ storeId }, 'INTERNAL_API_SECRET is not configured in s_server!');
                throw new Error('Internal server configuration error.');
            }

            if(!clientError|| !clientSuccess){
                const store = await Store.find(storeId);
                if(!store){
                    return clientError||'' //TODO une bonnne error
                }

                if(!clientError){
                    clientError = clientSuccess?.toLocaleLowerCase()?.replace('success','error') || store.domain_names+'/auth/google/error'
                }
                if(!clientSuccess){
                    clientSuccess = clientError?.toLocaleLowerCase()?.replace('error','success') || store.domain_names+'/auth/google/success'
                }

            }

            const apiPort = env.get('S_API_INTERNAL_PORT', '3334');
            const targetApiUrlProd = `http://api_store_${storeId}:${apiPort}`;
            const targetApiUrlDev = `http://${devIp}:${apiPort}`;
            const targetApiUrl = `${isProd ? targetApiUrlProd : targetApiUrlDev}/v1/auth/_internal/social-callback`;
            logger.info({ url: targetApiUrl }, 'Calling internal s_api endpoint...');

            // 5. Faire l'appel API interne synchrone avec fetch natif
            let apiResponseStatus: number;
            let apiResponseData: any;

            try {
                const fetchResponse = await fetch(targetApiUrl, {
                    method: 'POST',
                    headers: {
                        'X-Internal-Secret': internalApiSecret,
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                    },
                    body: JSON.stringify(profile),
                    // Ajouter un timeout via AbortController (méthode standard)
                    signal: AbortSignal.timeout(10000) // Timeout de 10 secondes
                });

                apiResponseStatus = fetchResponse.status;
                // Essayer de parser la réponse en JSON, même si le statut n'est pas 200
                // pour obtenir d'éventuels messages d'erreur de l'API
                try {
                    apiResponseData = await fetchResponse.json();
                    logger.info(apiResponseData,'apiResponseData')

                } catch (jsonError) {
                    // Si la réponse n'est pas du JSON valide (ex: erreur 500 sans JSON)
                    apiResponseData = { message: `s_api returned non-JSON response with status ${apiResponseStatus}` };
                    logger.warn({ storeId, status: apiResponseStatus, url: targetApiUrl }, 's_api response was not valid JSON');
                }

            } catch (fetchError: any) {
                // Gérer les erreurs réseau, timeout, etc.
                logger.error({ storeId, url: targetApiUrl, error: fetchError.message, code: fetchError.name }, 'Fetch error calling s_api');
                // Relancer une erreur pour la capture globale plus bas
                throw new Error(`Failed to call s_api: ${fetchError.message}`);
            }

            // 6. Gérer la réponse de s_api
            if (apiResponseStatus === 200 && apiResponseData?.token) {
                logger.info({ storeId, email: profile.email, isNewUser: apiResponseData.is_new_user }, 's_api returned success token');


                // --- Succès ! Renvoyer le token à l'utilisateur (via fragment) ---

                const redirectUrlWithToken = `${clientSuccess}?token=${encodeURIComponent(apiResponseData.token)}&expires_at=${encodeURIComponent(apiResponseData.expires_at || '')}`;

                logger.info({ clientSuccess: clientSuccess }, 'Redirecting user to frontend with token fragment');
                return redirectUrlWithToken;

            } else {
                // Réponse inattendue ou erreur de s_api
                logger.error({ storeId, status: apiResponseStatus, data: apiResponseData, url: targetApiUrl }, 'Unexpected or error response from s_api internal callback');
                return clientError
            }

        } catch (error) {
            return clientError
        }
    }

    // GET /auth/google/callback
    async google_callback({ request, ally, response }: HttpContext) {

        const google = ally.use('google').stateless();

        const state = request.input('state');
        let clientSuccess: string | null = null;
        let clientError: string | null = null;
        let error = '';
        let storeId = '';
        try {
            if (!state) throw new Error('State parameter missing');

            // console.log({getState :google.getState()});


            const decodedState = JSON.parse(state);

            clientSuccess = decodedState.clientSuccess;
            clientError = decodedState.clientError;
            storeId = decodedState.storeId
            logger.info({ clientSuccess, clientError,storeId }, 'State parameter verified');

            if (google.accessDenied()) error = "Accès refusé par Google.";
            if (google.stateMisMatch()) error = "Requête invalide ou expirée.";
            if (google.hasError()) {
                console.error("Erreur OAuth Google:", google.getError());
                error = `Erreur Google: ${google.getError()}`;
            }

        } catch (_error) {
            error = error || _error.message
        }
        const googleUser = await google.user();
        if (!googleUser.email) {
            error = "L'email Google n'a pas pu être récupéré.";
        }
        // Gérer les erreurs potentielles de Google

        console.log({ error });

        if (error) {
            if (clientError) {
                console.log('---> 1 tatus(200).sen');
                return response.status(200).send(redirectWithHtml(
                    `${clientError}?type=error_message&message=${encodeURIComponent(error)}&title=${encodeURIComponent('Erreur de connexion')}`
                ))
            }
            console.log('---> 1 badRequest');

            return response.badRequest(error);
        }

        if(storeId){
           const redirectStoreUrl = await this.storeAuthFromGoogle({
                data:{
                    clientError:clientError||'',
                    clientSuccess:clientSuccess||'',
                    storeId,
                },
                profile:{
                    avatarUrl:googleUser.avatarUrl,
                    email:googleUser.email,
                    fullName:googleUser.name,
                    provider:'google',
                    providerId:googleUser.id
                }
            });
            return response.status(200).send(redirectWithHtml(redirectStoreUrl));
        }
        
        // Récupérer les infos utilisateur de Google


        // Chercher ou créer l'utilisateur local
        let user = await User.query().where('email', googleUser.email).first();

        // Lier le compte social à l'utilisateur
        // Utilise findOrCreate pour éviter les erreurs si déjà lié
        if (!user) {
            // Si l'utilisateur n'existe PAS localement, on le crée
            const id = v4()
            user = await User.create({
                id,
                full_name: googleUser.name,
                email: googleUser.email,
                // Pas de mot de passe local nécessaire si login via Google uniquement
                // On pourrait générer un mdp aléatoire ou laisser null selon la stratégie
                password: v4(), // Exemple MDP aléatoire
                status: 'VISIBLE',
                email_verified_at:DateTime.now(),
                // Utilise l'avatar Google (assure-toi que `photos` est bien `string[]`)
                photo: googleUser.avatarUrl ? [googleUser.avatarUrl] : [],
            });

            try {
                await UserAuthentification.create({
                    id: v4(),
                    provider: 'google',
                    provider_id: googleUser.id,
                    user_id: id
                })
            } catch (error) {
                console.log('log 1', error.message);

            }

        } else {
            // Si l'utilisateur existe déjà, on pourrait vouloir mettre à jour son avatar/nom?
            user.full_name = googleUser.name;
            if (googleUser.avatarUrl && (!user.photo || !user.photo.includes(googleUser.avatarUrl))) {
                user.photo = [googleUser.avatarUrl, ...(user.photo ?? [])];
            }

            await user.save();
        }

        // Générer NOTRE token d'accès pour NOTRE API
        const userPayload = {
            userId: user.id,
            email: user.email,
            // roles_globaux: ['OWNER'] // Si applicable
        };

        const nbrDay = 30;
        let token = '';

        try {
            token = JwtService.sign(userPayload, {
                subject: user.id,
                issuer: 'https://server.sublymus.com', // Ton issuer
                // audience: 'https://dash.sublymus.com', // Ton audience
                expiresIn: `${nbrDay}d`, // Durée de validité
            });
        } catch (error) {
            console.log('log 2', error.message);

        }

        await user.load('roles'); // Charger rôles pour réponse

        // Réponse pour API/SPA : retourner un JSON avec le token

        const expires_at = DateTime.now().plus({ day: nbrDay }).toISODate();
        if (clientSuccess) {
            const redirectUrlWithToken = `${clientSuccess}?token=${encodeURIComponent(token)}&expires_at=${encodeURIComponent(expires_at)}`;
            logger.info({ clientSuccess: clientSuccess }, 'Redirecting user to frontend with token fragment');
            return response.status(200).send(redirectWithHtml(redirectUrlWithToken));
        }
        return response.ok({
            message: "Connecté avec succès via Google",
            user: user.serialize({ fields: { omit: ['password'] } }),
            type: 'bearer',
            token,
            expires_at,
        });

    }

} // Fin AuthController