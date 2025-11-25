import EmailVerificationToken from "#models/email_verification_token";
import User from "#models/user";
import UserAuthentification from "#models/user_authentification";
import env from "#start/env";
import logger from "@adonisjs/core/services/logger";
import db from "@adonisjs/lucid/services/db";
import { DateTime } from "luxon";
import { v4 } from "uuid";
import { http } from "../Utils/functions.js";
import JwtService from "#services/JwtService";
import Store from "#models/store";
import StoreCollaborator from "#models/store_collaborator";
import RedisService from "#services/RedisService";

type addUserType = {
    event: string,
    data: {
        server_action: string,
        to: string,
        subject: string,
        template: string,
        context: {
            store_slug: string,
            invitedUserName: string,
            storeName: string,
            inviterName: string,
            setupUrl: string
        }
    }
}
const addUser = async (payload: addUserType) => {
    // Vérifier si l'email existe déjà
    const store = await Store.findBy('slug', payload.data.context.store_slug)

    const existingUser = await User.findBy('email', payload.data.to);
    if (existingUser) {
        const userPayload = {
            userId: existingUser.id,
            email: existingUser.email,
        };

        const token = JwtService.sign(userPayload, {
            subject: existingUser.id,
            issuer: 'https://server.sublymus.com',
            // audience: 'https://dash.sublymus.com',
            expiresIn: '30d', // Durée de validité
        });

        logger.info({ user_id: existingUser.id }, ' Aldready exist , Action:' + payload.data.server_action);

        payload.data.context.setupUrl = `${http}dash.${env.get('SERVER_DOMAINE')}/auth/login?token=${token}`
        // console.log('setupUrl', payload.data.context.setupUrl);

        if (store) {
            await StoreCollaborator.create({
                id: v4(),
                store_id: store.id,
                user_id: existingUser.id
            })
        }
        return
    }

    const trx = await db.transaction()
    // Créer l'utilisateur
    try {
        const user = await User.create({
            id: v4(),
            full_name: payload.data.context.invitedUserName,
            email: payload.data.to,
            password: v4(),
            status: 'NEW',
        });

        await UserAuthentification.create({
            id: v4(),
            user_id: user.id,
            provider: 'email',
            provider_id: user.email,
        }, { client: trx });

        await EmailVerificationToken.query().where('user_id', user.id).delete();
        const tokenValue = 'email_' + v4()
        const expires_at = DateTime.now().plus({ hours: 24 });

        await EmailVerificationToken.create({
            user_id: user.id, token: tokenValue, expires_at: expires_at,
        });

        payload.data.context.setupUrl = `server.${env.get('SERVER_DOMAINE')}/auth/verify-email?token=${tokenValue}&store_slug=${payload.data.context.store_slug}`;
        console.log('setupUrl', payload.data.context.setupUrl);
        if (store) {
            await StoreCollaborator.create({
                id: v4(),
                store_id: store.id,
                user_id: user.id
            });
        }
        return
    } catch (error) {
        await trx.rollback(); // Assurer rollback en cas d'erreur (même si sendVerificationEmail échoue après)
        logger.error({ email: payload.data.to, error: error.message, stack: error.stack }, 'Registration failed');
        return

    }
}

type UpdateSeedFlagPayload = {
    event: string,
    data: {
        server_action: string,
        store_id: string,
        is_seed_applyed?: boolean
    }
}

const updateStoreSeedFlag = async (payload: UpdateSeedFlagPayload) => {
    const storeId = payload.data.store_id
    if (!storeId) {
        logger.warn('updateStoreSeedFlag appelé sans store_id')
        return
    }

    const store = await Store.find(storeId)
    if (!store) {
        logger.warn({ storeId }, 'Store introuvable pour updateStoreSeedFlag')
        return
    }

    const nextValue = payload.data.is_seed_applyed ?? true
    if (store.is_seed_applyed === nextValue) {
        logger.info({ storeId }, 'Flag de seed déjà à jour, aucune action.')
        return
    }

    store.is_seed_applyed = nextValue
    await store.save()
    await RedisService.setStoreCache(store)
    logger.info({ storeId }, `Flag is_seed_applyed mis à ${nextValue}`)
}

export const serverAction = {
    addUser,
    updateStoreSeedFlag,
}
