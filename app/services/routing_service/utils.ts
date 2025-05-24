// s_server/app/services/routing_service/utils.ts
import env from '#start/env';
import fs from 'fs/promises';
import path from 'path';
import { Logs } from '../../Utils/functions.js'; // Adapte ce chemin si besoin

// Chemins DANS LE CONTENEUR s_server où il écrit les configurations Nginx.
// Ces chemins sont les cibles des bind mounts depuis l'hôte.
export const NGINX_CONFS_BASE_PATH_IN_S_SERVER = env.get(
    'NGINX_CONF_BASE_IN_S_SERVER_CONTAINER', // Variable d'env définie dans setup-env-vars.sh
    env.get('NODE_ENV') == 'production' ? '/app_data/nginx_generated_conf' : '/etc/nginx' // Valeur par défaut si non définie
);

export const NGINX_SITES_AVAILABLE_PATH_IN_S_SERVER = path.join(
    NGINX_CONFS_BASE_PATH_IN_S_SERVER,
    env.get('NGINX_SITES_AVAILABLE_SUBDIR', 'sites-available') // Nom du sous-dossier
);

export const NGINX_SITES_ENABLED_PATH_IN_S_SERVER = path.join(
    NGINX_CONFS_BASE_PATH_IN_S_SERVER,
    env.get('NGINX_SITES_ENABLED_SUBDIR', 'sites-enabled') // Nom du sous-dossier
);

export const MAIN_SERVER_CONF_FILENAME = env.get('NGINX_MAIN_SERVER_CONF_FILENAME', '000-sublymus_platform.conf');
export const NGINX_SERVICE_NAME_IN_SWARM = env.get('NGINX_SERVICE_NAME_IN_SWARM', 'sublymus_proxy_nginx_proxy'); // Nom du service Nginx dans Swarm

// Headers Nginx (lus depuis .env, avec des valeurs par défaut)
export const TARGET_API_HEADER = env.get('TARGET_API_HEADER', 'x-target-api-service');
export const BASE_URL_HEADER = env.get('STORE_URL_HEADER', 'x-base-url'); // Renommé pour clarté
export const SERVER_URL_HEADER = env.get('SERVER_URL_HEADER', 'x-server-url');
export const SERVER_API_URL_HEADER = env.get('SERVER_API_URL_HEADER','x-server-api-url')
// Domaine principal de la plateforme (pour les redirections, etc.)
export const PLATFORM_MAIN_DOMAIN = env.get('SERVER_DOMAINE', 'sublymus.com'); // Doit correspondre à YOUR_MAIN_DOMAIN

/**
 * Retourne le nom de fichier de configuration pour un store.
 * @param storeId L'ID du store (UUID).
 */
export function getStoreConfFileName(storeId: string): string {
    // Utiliser un préfixe pour l'ordre, et l'ID pour l'unicité.
    return `100-store-${storeId}.conf`;
}

/**
 * S'assure que les répertoires Nginx nécessaires existent à l'intérieur du conteneur s_server.
 * (Là où s_server va écrire les fichiers de configuration).
 */
export async function ensureNginxDirsExistInContainer(logs: Logs): Promise<boolean> {
    try {
        await fs.stat(NGINX_SITES_AVAILABLE_PATH_IN_S_SERVER);
        await fs.stat(NGINX_SITES_ENABLED_PATH_IN_S_SERVER);
        // On pourrait vérifier les droits d'écriture ici, mais si le volume est bien monté
        // et que l'utilisateur du conteneur s_server a les droits sur le point de montage,
        // cela devrait suffire.
        logs.log(`✅ Répertoires Nginx internes (${NGINX_SITES_AVAILABLE_PATH_IN_S_SERVER}, ${NGINX_SITES_ENABLED_PATH_IN_S_SERVER}) vérifiés/créés.`);
        return true;
    } catch (error) {
        logs.notifyErrors('❌ Erreur création répertoires Nginx internes à s_server', {
            availablePath: NGINX_SITES_AVAILABLE_PATH_IN_S_SERVER,
            enabledPath: NGINX_SITES_ENABLED_PATH_IN_S_SERVER,
        }, error);
        return false;
    }
}

/**
 * Construit le chemin complet vers un fichier de configuration dans sites-available.
 */
export function getAvailableConfigPath(filename: string): string {
    return path.join(NGINX_SITES_AVAILABLE_PATH_IN_S_SERVER, filename);
}

/**
 * Construit le chemin complet vers un lien symbolique dans sites-enabled.
 */
export function getEnabledConfigPath(filename: string): string {
    return path.join(NGINX_SITES_ENABLED_PATH_IN_S_SERVER, filename);
}

// (Tu peux ajouter d'autres fonctions utilitaires ici si besoin)