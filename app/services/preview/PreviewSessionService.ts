// s_server/app/services/PreviewSessionService.ts
import { v4 as uuidv4 } from 'uuid';
import RedisService from '#services/RedisService'; // Ton service Redis
import Store from '#models/store';
import Theme from '#models/theme';
import logger from '@adonisjs/core/services/logger';

const PREVIEW_SESSION_KEY_PREFIX = 'preview_session:';
const PREVIEW_SESSION_TTL_SECONDS = 15 * 60; // 15 minutes

export interface PreviewSessionData {
  userId: string;
  storeId: string;
  themeId: string;
  createdAt: number; // Timestamp de création
}

class PreviewSessionService {
  /**
   * Crée une nouvelle session de prévisualisation et retourne un token.
   */
  async createSession(userId: string, storeId: string, themeId: string): Promise<string | null> {
    // Vérifier que le store et le thème existent et sont valides (optionnel ici, peut être fait par le controller)
    const store = await Store.find(storeId);
    const theme = await Theme.find(themeId);
    if (!store || !theme || !theme.is_active) {
      logger.warn({ userId, storeId, themeId }, "Tentative de création de session preview pour store/thème invalide.");
      return null;
    }


    const token = `preview_${theme.slug}_${uuidv4()}`; 
    const sessionData: PreviewSessionData = {
      userId,
      storeId,
      themeId,
      createdAt: Date.now(),
    };

    const redisKey = `${PREVIEW_SESSION_KEY_PREFIX}${token}`;

    try {
      const success = await RedisService.setCache(redisKey, sessionData, PREVIEW_SESSION_TTL_SECONDS);
      if (success) {
        logger.info({ userId, storeId, themeId, token }, "Session de prévisualisation créée");
        return token;
      } else {
        logger.error({ userId, storeId, themeId }, "Échec de la création de la session de prévisualisation dans Redis");
        return null;
      }
    } catch (error) {
      logger.error({ userId, storeId, themeId, err: error }, "Erreur Redis lors de la création de la session de prévisualisation");
      return null;
    }
  }

  /**
   * Valide un token de prévisualisation et retourne les données de session.
   * Optionnel: Supprime le token après la première validation pour un usage unique.
   */
  async validateSession(token: string, consumeToken: boolean = false): Promise<PreviewSessionData | null> {
    const redisKey = `${PREVIEW_SESSION_KEY_PREFIX}${token}`;
    try {
      const sessionData = await RedisService.getCache<PreviewSessionData>(redisKey);
      if (sessionData && consumeToken) {
        logger.info({ token, consumed: true }, "Session de prévisualisation validée et consommée");
      } else if (sessionData) {
        logger.info({ token, consumed: false }, "Session de prévisualisation validée");
      } else {
        logger.warn({ token }, "Tentative de validation d'une session de prévisualisation invalide ou expirée");
      }
      return sessionData;
    } catch (error) {
      logger.error({ token, err: error }, "Erreur Redis lors de la validation de la session de prévisualisation");
      return null;
    }
  }
}

export default new PreviewSessionService();