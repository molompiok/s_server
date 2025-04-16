// app/services/RoutingService.ts

import { Logs, writeFile, requiredCall } from '../controllers2/Utils/functions.js' 
import env from '#start/env'
import Store from '#models/store'
import Theme from '#models/theme'
import { execa } from 'execa'
import fs from 'fs/promises'
import path from 'path'
import Api from '#models/api'

// Constantes pour les chemins Nginx
export const NGINX_SITES_AVAILABLE = '/etc/nginx/sites-available';
export const NGINX_SITES_ENABLED = '/etc/nginx/sites-enabled';
export const SERVER_CONF_NAME = 'sublymus_server';

// Helper pour s'assurer que les répertoires Nginx existent
async function ensureNginxDirsExist(): Promise<boolean> {
    try {
        await fs.stat(NGINX_SITES_AVAILABLE);
        await fs.stat(NGINX_SITES_ENABLED);
        return true;
    } catch (error) {
        console.error("Erreur: Les répertoires Nginx n'existent pas ou ne sont pas accessibles.", error);
        return false;
    }
}

/**
 * Fonction pour effectivement tester et recharger Nginx.
 * Sera appelée via le debounce/requiredCall.
 */
async function _applyNginxReload(): Promise<boolean> {
    const logs = new Logs('RoutingService._applyNginxReload');
    try {
        logs.log('🧪 Test de la configuration Nginx...');
        await execa('sudo', ['nginx', '-t']);
        logs.log('✅ Configuration Nginx valide.');
        logs.log('🚀 Rechargement de Nginx...');
        await execa('sudo', ['systemctl', 'reload', 'nginx']);
        logs.log('✅ Nginx rechargé avec succès.');
        return true;
    } catch (error: any) {
        logs.notifyErrors('❌ Erreur lors du test ou du rechargement de Nginx', {}, error);
        if (error.stderr) {
            logs.log("--- Nginx Error Output ---");
            logs.log(error.stderr);
            logs.log("--------------------------");
        }
        return false;
    }
}

// --- Instance de RoutingService (Singleton) ---
class RoutingServiceClass {

    /**
     * Déclenche un rechargement Nginx (débouncé).
     */
    async triggerNginxReload(): Promise<void> {
        // Utilise requiredCall pour débouncer l'appel à _applyNginxReload
        await requiredCall(_applyNginxReload);
    }

    /**
     * Met à jour la configuration Nginx pour un store spécifique (domaines custom).
     * @param store Le Store concerné.
     * @param triggerReload Indique s'il faut déclencher un rechargement (débouncé) après l'écriture.
     * @returns Succès de l'écriture et de l'activation du fichier (hors reload).
     */
    async updateStoreRouting(store: Store, triggerReload = true): Promise<boolean> {
        const logs = new Logs(`RoutingService.updateStoreRouting (${store.id})`);
        if (!(await ensureNginxDirsExist())) return false;

        const confFileName = `${store.id}.conf`;
        const confFilePathAvailable = path.join(NGINX_SITES_AVAILABLE, confFileName);
        const confFilePathEnabled = path.join(NGINX_SITES_ENABLED, confFileName);

        // Si pas de domaines custom, on supprime la conf existante
        if (!store.domain_names || store.domain_names.length === 0) {
            // Appelle remove SANS déclencher de reload ici, le reload global suivra si nécessaire
            const removed = await this.removeStoreRoutingById(store.id, false);
             // Si la suppression a potentiellement changé l'état et qu'un reload est demandé
             if (removed && triggerReload) await this.triggerNginxReload();
             return removed; // Retourne le succès de la suppression
        }

        // --- Génération de la Configuration ---
        const themeId = store.current_theme_id || '';
        const themeServiceName = themeId ? `theme_${themeId}` : `api_store_${store.id}`;
        let targetPort: number;

        try {
             // Utilise la DB pour récupérer le port interne (plus fiable)
            if (themeId) {
                 const theme = await Theme.find(themeId);
                 if (!theme) throw new Error(`Thème ${themeId} non trouvé pour le port.`);
                targetPort = theme.internal_port;
             } else {
                 // Pour l'API, récupérer celle associée au store si possible, sinon la default
                 let api = store.current_api_id ? await Api.find(store.current_api_id) : null;
                 if (!api) api = await Api.findDefault();
                 if (!api) throw new Error(`API (spécifique ou défaut) non trouvée pour le port.`);
                targetPort = api.internal_port;
             }
             if (!targetPort) throw new Error(`Port interne non trouvé pour le service ${themeServiceName}`);

        } catch (portError) {
            logs.notifyErrors(`❌ Erreur récupération port pour '${themeServiceName}'`, { storeId: store.id }, portError);
            return false;
        }

        const domainList = store.domain_names.join(' ');
        const nginxConfig = `
# Config Store ${store.id} (${store.name}) - Domains: ${domainList}
# Target Service: ${themeServiceName}:${targetPort}
server {
    listen 80;
    # listen [::]:80;
    server_name ${domainList};

    # access_log /var/log/nginx/store_${store.id}.access.log;
    # error_log /var/log/nginx/store_${store.id}.error.log;

    location / {
        resolver 127.0.0.11 valid=10s;
        set $target_service http://${themeServiceName}:${targetPort};

        proxy_pass $target_service;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    # TODO: Add SSL/TLS config here
}`;
        // --- Écriture et Activation ---
        try {
            logs.log(`📝 Écriture config Nginx (via sudo tee): ${confFilePathAvailable}`);
            await writeFile(confFilePathAvailable, nginxConfig); // TODO debounce

            logs.log(`🔗 Activation site Nginx (symlink)...`);
            try {
                // Gère la création/mise à jour du lien symbolique avec sudo si nécessaire
                 await fs.unlink(confFilePathEnabled).catch(e => { if (e.code !== 'ENOENT') throw e; });
                 await fs.symlink(confFilePathAvailable, confFilePathEnabled);
             } catch (symlinkError: any) {
                 if (symlinkError.code === 'EACCES' || symlinkError.code === 'EPERM') {
                     logs.log("   -> Création/MàJ lien nécessite sudo...");
                     try {
                         await execa('sudo', ['ln', '-sf', confFilePathAvailable, confFilePathEnabled]);
                     } catch (sudoSymlinkError) {
                         logs.notifyErrors(`❌ Erreur lien (sudo) pour store ${store.id}`, {}, sudoSymlinkError);
                         throw sudoSymlinkError;
                     }
                 } else { throw symlinkError; }
             }
            logs.log(`✅ Config Nginx pour store ${store.id} mise à jour.`);

            // Déclenche le reload (débouncé) si demandé
            if (triggerReload) {
                await this.triggerNginxReload();
            }
            return true;

        } catch (error) {
            logs.notifyErrors(`❌ Erreur écriture/activation config Nginx pour ${store.id}`, {}, error);
            return false;
        }
    }

    /**
     * Supprime la configuration Nginx pour un store spécifique.
     * @param storeId L'ID du store (ou BASE_ID).
     * @param triggerReload Indique s'il faut déclencher un rechargement (débouncé) après la suppression.
     * @returns boolean Succès de la suppression (des fichiers/liens).
     */
    async removeStoreRoutingById(storeId: string, triggerReload = true): Promise<boolean> {
        const logs = new Logs(`RoutingService.removeStoreRoutingById (${storeId})`);
        if (!(await ensureNginxDirsExist())) return false;

        const confFileName = `${storeId}.conf`;
        const confFilePathAvailable = path.join(NGINX_SITES_AVAILABLE, confFileName);
        const confFilePathEnabled = path.join(NGINX_SITES_ENABLED, confFileName);
        let needsReload = false;

        try {
             logs.log(`🗑️ Suppression fichier Nginx (sudo rm): ${confFilePathAvailable}`);
            // Utilise sudo rm -f pour ignorer les erreurs si absent mais gérer les perms
             await execa('sudo', ['rm', '-f', confFilePathAvailable]);
            needsReload = true; // Suppose qu'un changement a eu lieu
        } catch (error: any) {
            // En théorie, rm -f ne devrait pas échouer facilement sauf permission sudo elle-même
             logs.notifyErrors(`⚠️ Erreur suppression ${confFilePathAvailable} (sudo rm)`, {}, error);
             // On continue quand même à essayer de supprimer le lien
        }

        try {
            logs.log(`🗑️ Suppression lien Nginx (sudo rm): ${confFilePathEnabled}`);
            await execa('sudo', ['rm', '-f', confFilePathEnabled]);
            needsReload = true;
        } catch (error: any) {
            logs.notifyErrors(`⚠️ Erreur suppression lien ${confFilePathEnabled} (sudo rm)`, {}, error);
        }

        // Déclenche le reload débouncé SI on a potentiellement supprimé qqch ET si demandé
        if (needsReload && triggerReload) {
            await this.triggerNginxReload();
        }
        return !logs.errors.length; // Succès s'il n'y a pas eu d'erreur bloquante lors des rm
    }

    /**
     * Met à jour le fichier serveur principal (sublymus_server.conf).
     * @param triggerReload Indique s'il faut déclencher un rechargement (débouncé).
     * @returns boolean Succès de l'écriture/activation du fichier principal.
     */
    async updateServerRouting(triggerReload = true): Promise<boolean> {
        const logs = new Logs('RoutingService.updateServerRouting');
        if (!(await ensureNginxDirsExist())) return false;

        const confFileName = `${SERVER_CONF_NAME}.conf`;
        const confFilePathAvailable = path.join(NGINX_SITES_AVAILABLE, confFileName);
        const confFilePathEnabled = path.join(NGINX_SITES_ENABLED, confFileName);
        const mainDomain = env.get('SERVER_DOMAINE', 'sublymus.local'); // Mettre un domaine local par défaut
        const backendHost = env.get('HOST', '127.0.0.1'); // Pointer vers 127.0.0.1 par défaut
        const backendPort = env.get('PORT', '5555');

        try {
            logs.log(`⚙️ Génération config Nginx pour ${mainDomain}...`);
             const stores = await Store.query().where('is_active', true).orderBy('name', 'asc');
            let locationsBlocks = '';

            for (const store of stores) {
                 const themeId = store.current_theme_id || '';
                 const serviceName = themeId ? `theme_${themeId}` : `api_store_${store.id}`;
                 let targetPort: number;

                 try {
                     if (themeId) {
                         const theme = await Theme.find(themeId);
                          if (!theme) throw new Error(`Thème ${themeId} non trouvé.`);
                         targetPort = theme.internal_port;
                     } else {
                          let api = store.current_api_id ? await Api.find(store.current_api_id) : null;
                          if (!api) api = await Api.findDefault();
                          if (!api) throw new Error(`API non trouvée pour store ${store.id}.`);
                         targetPort = api.internal_port;
                     }
                      if (!targetPort) throw new Error(`Port interne manquant pour ${serviceName}`);

                 } catch (portError) {
                     logs.logErrors(`⚠️ Store ${store.id} (${store.name}): impossible déterminer port pour ${serviceName}. Location ignorée.`, {}, portError);
                     continue;
                 }

                locationsBlocks += `
    # Store: ${store.name} (${store.id}) -> ${serviceName}:${targetPort}
    location /${store.slug}/ { # Utilise le slug pour le path
        resolver 127.0.0.11 valid=10s;
        set $target_service http://${serviceName}:${targetPort};
        proxy_pass $target_service/; # Ajoute le / final pour potentiellement aider à la réécriture

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Tentative de réécriture pour enlever le préfixe slug (requiert proxy_pass AVEC / final)
         rewrite ^/${store.slug}/(.*)$ /$1 break;
    }`;
            }

            const nginxConfig = `
# Config Domain: ${mainDomain} -> s_server backend: ${backendHost}:${backendPort}
server {
    listen 80 default_server; # 'default_server' important si aucun autre serveur 80 n'est default
    # listen [::]:80 default_server;
    server_name ${mainDomain} _; # Écoute sur le domaine principal et comme serveur par défaut

    # Logs (optionnel)
    # access_log /var/log/nginx/${SERVER_CONF_NAME}.access.log;
    # error_log /var/log/nginx/${SERVER_CONF_NAME}.error.log warn;

    # --- Backend principal (s_server) ---
    location / {
        proxy_pass http://${backendHost}:${backendPort};
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # --- Stores Actifs (locations basées sur slug) ---
    ${locationsBlocks}

    # TODO: Config SSL/TLS
}`;
            logs.log(`📝 Écriture config Nginx (via sudo tee): ${confFilePathAvailable}`);
            await writeFile(confFilePathAvailable, nginxConfig); // TODO debounce

            logs.log(`🔗 Activation site principal (symlink)...`);
            try {
                 // Utilise sudo pour le lien pour être sûr
                await execa('sudo', ['ln', '-sf', confFilePathAvailable, confFilePathEnabled]);
            } catch (sudoSymlinkError) {
                logs.notifyErrors(`❌ Erreur lien symbolique principal (sudo)`, {}, sudoSymlinkError);
                throw sudoSymlinkError;
            }
            logs.log('✅ Config Nginx principale mise à jour.');

            if (triggerReload) {
                await this.triggerNginxReload();
            }
            return true;

        } catch (error) {
            logs.notifyErrors(`❌ Erreur lors de la MàJ config Nginx principale`, {}, error);
            return false;
        }
    }

    /**
     * Supprime toutes les configurations Nginx gérées par Sublymus.
     * @param triggerReload Déclenche un reload (débouncé) après suppression.
     */
    async removeAllManagedRouting(triggerReload = true): Promise<boolean> {
        const logs = new Logs('RoutingService.removeAllManagedRouting');
        if (!(await ensureNginxDirsExist())) return false;
        let allSuccess = true;
        let needsReload = false;

        logs.log('🧹 Suppression des configs Nginx Sublymus...');

        // Supprime la conf principale
        logs.log(`🔧 Suppression config principale (${SERVER_CONF_NAME})`);
         // Appelle remove SANS reload pour ne pas le faire pour chaque fichier
         const mainRemoved = await this.removeStoreRoutingById(SERVER_CONF_NAME, false);
         if (mainRemoved) needsReload = true; // Si on a effectivement supprimé qqch
         allSuccess = mainRemoved && allSuccess;

        // Supprime les confs des stores
        const stores = await Store.all();
        for (const store of stores) {
            logs.log(`🔧 Suppression config store ${store.id}`);
            const removed = await this.removeStoreRoutingById(store.id, false);
            if (removed) needsReload = true;
            allSuccess = removed && allSuccess;
        }

        if (needsReload && triggerReload) {
            logs.log('🔄 Déclenchement reload Nginx (débouncé)...');
            await this.triggerNginxReload();
        } else {
            logs.log('ℹ️ Rechargement Nginx non déclenché.');
        }

        if (allSuccess) logs.log('✅ Toutes les configs Nginx supprimées/tentées.');
        else logs.notifyErrors('❌ Certaines configs Nginx n’ont pas pu être supprimées correctement.');

        return allSuccess;
    }
}

// Exporte une instance unique de la classe pour utilisation comme singleton
const RoutingService = new RoutingServiceClass();
export default RoutingService;