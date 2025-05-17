// app/services/RoutingService.ts
import { Logs, writeFile, requiredCall } from '../Utils/functions.js'
import env from '#start/env'
import Store from '#models/store'
import Theme from '#models/theme'
import { execa } from 'execa'
import fs from 'fs/promises'
import path from 'path'
import Api from '#models/api'
import SwarmService from './SwarmService.js'

// Constantes pour les chemins Nginx
export const NGINX_SITES_AVAILABLE = '/etc/nginx/sites-available';
export const NGINX_SITES_ENABLED = '/etc/nginx/sites-enabled';
const NGINX_PROXY_SERVICE_NAME = 'sublymus_infra_nginx_proxy';

export const SERVER_CONF_NAME = 'sublymus_server';

const TARGET_API_HEADER = 'X-Target-Api-Service'; //=> En miniscule dans le header..  tres important a noter
const BASE_URL_HEADER = 'X-Base-Url';
const SERVER_URL_HEADER = 'X-Server-Url';

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
    const logs = new Logs('RoutingService._applyNginxReload (Swarm Mode)');
    try {
        logs.log(`🔄 Forçage de la mise à jour du service Swarm '${NGINX_PROXY_SERVICE_NAME}' pour recharger la configuration Nginx...`);
        // Forcer une mise à jour du service force Swarm à redéployer les tâches
        // avec la configuration la plus récente (y compris les volumes montés).
        // Une méthode plus fine serait d'envoyer un signal SIGHUP au conteneur Nginx,
        // mais --force est plus simple à implémenter avec SwarmService.
        const success = await SwarmService.forceServiceUpdate(NGINX_PROXY_SERVICE_NAME);
        if (success) {
            logs.log(`✅ Mise à jour du service '${NGINX_PROXY_SERVICE_NAME}' demandée.`);
            return true;
        } else {
            logs.logErrors(`❌ Échec de la demande de mise à jour pour '${NGINX_PROXY_SERVICE_NAME}'.`);
            return false;
        }
    } catch (error: any) {
        logs.notifyErrors(`❌ Erreur lors de la tentative de rechargement de Nginx via Swarm`, {}, error);
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
        await requiredCall(_applyNginxReload);// TODO ameliorer et utiliser le bouncer
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
        let targetServiceName: string = '';
        let targetPort: number;
        let isThemeTarget = false;

        try {
            const themeId = store.current_theme_id;
            // Utilise la DB pour récupérer le port interne (plus fiable)
            if (themeId) {
                const theme = await Theme.find(themeId);
                if (!theme) throw new Error(`Thème ${themeId} non trouvé.`);
                targetPort = theme.internal_port;
                targetServiceName = `theme_${theme.id}`;
            } else {
                // Pour l'API, récupérer celle associée au store si possible, sinon la default
                let api = store.current_api_id ? await Api.find(store.current_api_id) : null;
                if (!api) api = await Api.findDefault();
                if (!api) throw new Error(`API non trouvée pour le store ${store.id}.`);
                targetServiceName = `api_store_${store.id}`; // Cible = API
                targetPort = api.internal_port;
                isThemeTarget = false;
            }
            if (!targetPort) throw new Error(`Port interne non trouvé pour le service ${targetServiceName}`);

        } catch (portError) {
            logs.notifyErrors(`❌ Erreur récupération port pour '${store.id}'`, { storeId: store.id }, portError);
            return false;
        }

        const domainList = store.domain_names.join(' ');

        // Ajout conditionnel de l'en-tête
        const targetApiHeaderInjection = isThemeTarget
            ? `proxy_set_header ${TARGET_API_HEADER} api_store_${store.id}; # Injecte le nom du service API cible`
            : '# Pas de thème, pas besoin d\'injecter l\'en-tête API cible';



        const nginxConfig = `
# Config Store ${store.id} (${store.name}) - Domains: ${domainList}
# Target Service: ${targetServiceName}:${targetPort}
server {
    listen 80;
    # listen [::]:80;
    server_name ${domainList};

    # access_log /var/log/nginx/store_${store.id}.access.log;
    # error_log /var/log/nginx/store_${store.id}.error.log;

    location / {
        resolver 127.0.0.11 valid=10s; # Résolveur interne Docker Swarm
        set $target_service http://${targetServiceName}:${targetPort};

        proxy_pass $target_service;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Injection conditionnelle de l'en-tête pour les thèmes
        ${targetApiHeaderInjection}
        
    }
    # TODO: Add SSL/TLS config here
}`;
        // --- Écriture et Activation ---
        try {
            logs.log(`📝 Écriture config Nginx (via sudo tee): ${confFilePathAvailable}`);
            await writeFile(confFilePathAvailable, nginxConfig); // Utilise ta fonction helper

            logs.log(`🔗 Activation site Nginx (symlink)...`);
            // ... (logique de symlink existante, avec sudo si besoin) ...
            try {
                await fs.unlink(confFilePathEnabled).catch(e => { if (e.code !== 'ENOENT') throw e; });
                await fs.symlink(confFilePathAvailable, confFilePathEnabled);
            } catch (symlinkError: any) {
                if (symlinkError.code === 'EACCES' || symlinkError.code === 'EPERM') {
                    logs.log("   -> Création/MàJ lien nécessite sudo...");
                    await execa('sudo', ['ln', '-sf', confFilePathAvailable, confFilePathEnabled]);
                } else { throw symlinkError; }
            }


            logs.log(`✅ Config Nginx pour store ${store.id} mise à jour.`);
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
        
        const mainDomain = env.get('SERVER_DOMAINE', 'sublymus-server.com'); // Mettre un domaine local par défaut
        const backendHost = env.get('HOST', '0.0.0.0'); // Pointer vers0.0.0.0 par défaut
        const backendPort = env.get('PORT', '5555');

        try {
            logs.log(`⚙️ Génération config Nginx pour ${mainDomain}...`);
            const stores = await Store.query().where('is_active', true).orderBy('name', 'asc');
            let locationsBlocks = '';

            for (const store of stores) {
                let targetServiceName: string;
                let targetPort: number;
                let isThemeTarget = false;

                try {
                    const themeId = store.current_theme_id;
                    const apiId = store.current_api_id;
                    // TODO  utiliser le store.theme // preload
                    // TODO  ameliorer cette parties du code, 
                    if (themeId) {
                        let  theme = await Theme.find(themeId);
                        if (!theme) throw new Error(`Thème ${themeId} non trouvé pour store ${store.id}.`);
                        targetServiceName = `theme_${theme.id}`;
                        targetPort = theme.internal_port;
                        isThemeTarget = true; // <<<<<< MARQUER QUE LA CIBLE EST UN THÈME
                    } else {
                        let api = apiId ? await Api.find(apiId) : null;
                        if (!api) api = await Api.findDefault();
                        if (!api) throw new Error(`API non trouvée pour store ${store.id}.`);
                        targetServiceName = `api_store_${store.id}`;
                        targetPort = api.internal_port;
                        isThemeTarget = false;
                    }
                    if (!targetPort) throw new Error(`Port interne manquant pour ${targetServiceName}`);

                } catch (lookupError) {
                    logs.logErrors(`⚠️ Store ${store.id} (${store.name}): impossible déterminer service/port cible. Location ignorée.`, { storeId: store.id }, lookupError);
                    continue; // Passe au store suivant
                }


                // Ajout conditionnel de l'en-tête
                const targetApiHeaderInjection = isThemeTarget
                    ? `proxy_set_header ${TARGET_API_HEADER} api_store_${store.id}; # Injecte le nom du service API cible`
                    : '# Pas de thème, pas besoin d\'injecter l\'en-tête API cible';

                // Ajout de la logique de réécriture si le proxy_pass termine par /
                const rewriteRule = isThemeTarget
                    ? `rewrite ^/${store.slug}/(.*)$ /$1 break; # Enlève le préfixe pour le thème`
                    : '# Pas de réécriture nécessaire si on pointe directement vers l\'API';
                const proxyPassTarget = isThemeTarget
                    ? `$target_service/` // Ajoute le / final pour la réécriture vers le thème
                    : `$target_service`;  // Pas de / final si on pointe vers l'API


                locationsBlocks += `
    # Store: ${store.name} (${store.id}) -> ${targetServiceName}:${targetPort}
    location /${store.slug}/ {
        resolver 127.0.0.11 valid=10s;
        set $target_service http://${targetServiceName}:${targetPort};

        # Proxy vers le THÈME (avec / final) ou l'API (sans / final)
        proxy_pass ${proxyPassTarget};

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Injection conditionnelle de l'en-tête
        ${targetApiHeaderInjection}

        # Réécriture conditionnelle du path pour les thèmes
        ${rewriteRule}
    }`;
            } // Fin de la boucle for

 

            const testStulg0 = 'ladona10';  // test Store slug (ladona10)
            const testStulg1 = 'ladona11';  // test Store slug (ladona2)
            const TestApiUrl =  'http://172.25.72.235:3334'; //internal sarwm  (api Service Name) + port 
            const TestDashUrl =  'http://172.25.72.235:3005';//internal sarwm  (dash Service Name) + port
            // const TestDocsUrl =  'http://172.25.72.235:3005';//internal sarwm  (docs Service Name) + port
            const testTheme0 = 'http://172.25.72.235:3001';//internal sarwm  (theme0 Service Name) + port
            const testTheme1 = 'http://172.25.72.235:3006';//internal sarwm  (theme1 Service Name) + port
            const testServer = 'http://172.25.72.235:5555';//internal sarwm  (server Service Name) + port
            const testDomaine0 = 'ladona10.com' // test store name (ladona)
            const testDomaine1 = 'ladona11.com' // test store name (ladona)
            const dashSubDomain = `dash.${mainDomain}`; // test local domain dash..
            const docsSubDomain = `docs.${mainDomain}`; // test local domain docs..
            const serverApiSubDomain = `server.${mainDomain}`; // test local domain docs..
            const apiSubDomain = `api.${mainDomain}`; // test local domain api..
            const testWelcomePage = 'http://172.25.72.235:3003';//internal sarwm  (welcomePage Service Name) + port

            const nginxConfig = `
server {
    listen 80;
    # listen [::]:80;
    server_name ${dashSubDomain};

    location / {
        resolver 127.0.0.11 valid=10s; # Résolveur interne Docker Swarm
        set $target_service ${TestDashUrl};

        proxy_pass $target_service;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Injection conditionnelle de l'en-tête pour les thèmes
        proxy_set_header ${TARGET_API_HEADER} ${TestApiUrl}; 
        proxy_set_header ${BASE_URL_HEADER} http://${dashSubDomain}; 
        proxy_set_header ${SERVER_URL_HEADER} ${mainDomain};
    }
    # TODO: Add SSL/TLS config here
}
server {
    listen 80;
    server_name ${serverApiSubDomain}; 

    location / {
        resolver 127.0.0.11 valid=10s;
        set $target_s_server_api ${testServer};
        proxy_pass $target_s_server_api;

        proxy_set_header Host $host;
        # ... autres headers ...
    }
}
    
server {
    listen 80;
    server_name ${docsSubDomain}; 

    location / {
        resolver 127.0.0.11 valid=10s;
        set $target ${testWelcomePage};
        proxy_pass $target;

        proxy_set_header Host $host;
        # ... autres headers ...
    }
}
server {
    listen 80;
    server_name ${apiSubDomain} ;

    # Chaque store aura sa propre location basée sur son slug (ou ID)
    # Exemple pour le store 'ladona2' (slug)
    location /${testStulg0}/ {
        resolver 127.0.0.11 valid=10s;
        set $target_api_service_store ${TestApiUrl}; # Nom du service Swarm de l'API du store ${testStulg0} et son port

        # proxy_pass doit envoyer TOUT le path restant après /${testStulg0}/
        # Par exemple, si la requête est /${testStulg0}/products, on veut envoyer /products à l'API du store
        rewrite ^/${testStulg0}/(.*)$ /$1 break; # Enlève /${testStulg0}/ du path
        proxy_pass $target_api_service_store;  # Note: PAS de / à la fin ici si rewrite est utilisé comme ça

        proxy_set_header Host $host; # Ou $target_api_service_store si l'API attend son nom de service
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        # Potentiellement d'autres headers si l'API du store en a besoin
    }
        
    location /${testStulg1}/ {
        resolver 127.0.0.11 valid=10s;
        set $target_api_service_store ${TestApiUrl}; # Nom du service Swarm de l'API du store ${testStulg0} et son port

        # proxy_pass doit envoyer TOUT le path restant après /${testStulg1}/
        # Par exemple, si la requête est /${testStulg1}/products, on veut envoyer /products à l'API du store
        rewrite ^/${testStulg1}/(.*)$ /$1 break; # Enlève /${testStulg1}/ du path
        proxy_pass $target_api_service_store;  # Note: PAS de / à la fin ici si rewrite est utilisé comme ça

        proxy_set_header Host $host; # Ou $target_api_service_store si l'API attend son nom de service
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        # Potentiellement d'autres headers si l'API du store en a besoin
    }

    # Répéter pour chaque store actif...
    # location /autre-store-slug/ { ... }

    location / {
        proxy_pass ${TestApiUrl};
        #proxy_pass ${TestApiUrl};
        proxy_set_header Host $host;
        # ... autres headers pour s_server ...
    }
}

server {
    listen 80;
    # listen [::]:80;
    server_name ${testDomaine0};

    location / {
        resolver 127.0.0.11 valid=10s; # Résolveur interne Docker Swarm
        set $target_service ${testTheme0};

        proxy_pass $target_service;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Injection conditionnelle de l'en-tête pour les thèmes
        proxy_set_header ${TARGET_API_HEADER} http://${apiSubDomain}/${testStulg0}; 
        proxy_set_header ${BASE_URL_HEADER} http://${testDomaine0}; 
        proxy_set_header ${SERVER_URL_HEADER} ${mainDomain};
    }
    # TODO: Add SSL/TLS config here
}

server {
    listen 80;
    # listen [::]:80;
    server_name ${testDomaine1};

    location / {
        resolver 127.0.0.11 valid=10s; # Résolveur interne Docker Swarm
        set $target_service ${testTheme1};

        proxy_pass $target_service;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Injection conditionnelle de l'en-tête pour les thèmes
        proxy_set_header ${TARGET_API_HEADER} http://${apiSubDomain}/${testStulg1}; 
        proxy_set_header ${BASE_URL_HEADER} http://${testDomaine1}; 
        proxy_set_header ${SERVER_URL_HEADER} ${mainDomain};
    }
    # TODO: Add SSL/TLS config here
}
# Config Domain: ${mainDomain} -> s_server backend: ${backendHost}:${backendPort}
server {
    listen 80 default_server;
    # listen [::]:80 default_server;
    server_name ${mainDomain};

    # Logs (optionnel)
    # access_log /var/log/nginx/${SERVER_CONF_NAME}.access.log;
    # error_log /var/log/nginx/${SERVER_CONF_NAME}.error.log warn;

    # --- Backend principal (s_server) ---
    location / {
        proxy_pass ${testWelcomePage};
        #proxy_pass http://${backendHost}:${backendPort};
        proxy_set_header Host $host;
        # ... autres headers pour s_server ...
    }
    location /${testStulg0}/ {
        resolver 127.0.0.11 valid=10s;
        set $target_service ${testTheme0};

        # Proxy vers le THÈME (avec / final) ou l'API (sans / final)
        proxy_pass $target_service;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Injection conditionnelle de l'en-tête
         proxy_set_header ${TARGET_API_HEADER} http://${apiSubDomain}/${testStulg0}; 
        proxy_set_header ${BASE_URL_HEADER} /${testStulg0}/; 
        proxy_set_header ${SERVER_URL_HEADER} http://${serverApiSubDomain};

        # Réécriture conditionnelle du path pour les thèmes
        rewrite ^/${testStulg0}/(.*)$ /$1 break; 
    }
    location /${testStulg1}/ {
        resolver 127.0.0.11 valid=10s;
        set $target_service ${testTheme1};

        # Proxy vers le THÈME (avec / final) ou l'API (sans / final)
        proxy_pass $target_service;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Injection conditionnelle de l'en-tête
         proxy_set_header ${TARGET_API_HEADER} http://${apiSubDomain}/${testStulg1}; 
        proxy_set_header ${BASE_URL_HEADER} /${testStulg1}/; 
        proxy_set_header ${SERVER_URL_HEADER} http://${serverApiSubDomain};

        # Réécriture conditionnelle du path pour les thèmes
        rewrite ^/${testStulg1}/(.*)$ /$1 break; 
    }
    
    # --- Stores Actifs (locations basées sur slug) ---
    ${locationsBlocks}

    # TODO: Config SSL/TLS
}`;
            // --- Écriture et Activation ---
            logs.log(`📝 Écriture config Nginx (via sudo tee): ${confFilePathAvailable}`);
            await writeFile(confFilePathAvailable, nginxConfig); // Utilise ta fonction helper

            logs.log(`🔗 Activation site principal (symlink)...`);
            // ... (logique de symlink existante avec sudo si besoin) ...
            await execa('sudo', ['ln', '-sf', confFilePathAvailable, confFilePathEnabled]);


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