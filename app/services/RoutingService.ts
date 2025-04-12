// app/services/RoutingService.ts

import { Logs } from '../controllers2/Utils/functions.js' // Gardons Logs
import { serviceNameSpace } from '../controllers2/Utils/functions.js'
import env from '#start/env'
import Store from '#models/store'
import Theme from '#models/theme'
import { execa } from 'execa'
import fs from 'fs/promises'
import path from 'path'
import SwarmService from '#services/SwarmService' // On pourrait avoir besoin d'inspecter pour les ports internes
import Api from '#models/api'

// Constantes pour les chemins Nginx
export const NGINX_SITES_AVAILABLE = '/etc/nginx/sites-available';
export const NGINX_SITES_ENABLED = '/etc/nginx/sites-enabled';
export const SERVER_CONF_NAME = 'sublymus_server'; // Nom pour le fichier de conf principal

// Helper pour s'assurer que les répertoires Nginx existent
async function ensureNginxDirsExist(): Promise<boolean> {
    try {
        await fs.stat(NGINX_SITES_AVAILABLE);
        await fs.stat(NGINX_SITES_ENABLED);
        return true;
    } catch (error) {
        console.error("Erreur: Les répertoires Nginx n'existent pas ou ne sont pas accessibles.", error);
        return false; // Ne peut pas continuer si les dirs de base n'existent pas
    }
}

// Helper pour recharger Nginx de manière sûre
async function reloadNginx(): Promise<boolean> {
    const logs = new Logs('RoutingService.reloadNginx');
    try {
        logs.log('🧪 Test de la configuration Nginx...');
        await execa('sudo', ['nginx', '-t']);
        logs.log('✅ Configuration Nginx valide.');
        logs.log('🚀 Rechargement de Nginx...');
        await execa('sudo', ['systemctl', 'reload', 'nginx']);
        // Alternative: Si Nginx tourne en service Swarm, on peut envoyer SIGHUP:
        // await execa('sudo', ['docker', 'service', 'ps', '-q', 'nginx_service_name']) // get task id
        // await execa('sudo', ['docker', 'kill', '-s', 'HUP', 'task_id'])
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

class RoutingService {
    public reloadNginx() {
        return reloadNginx()
    }
    /**
     * Met à jour la configuration Nginx pour un store spécifique (domain_names custom).
     * Crée ou met à jour le fichier store_id.conf dans sites-available et sites-enabled.
     * Supprime le fichier si le store n'a plus de domain_names custom.
     *
     * @param store Le Store concerné.
     * @param reload Optionnel (défaut: true). Indique s'il faut recharger Nginx après.
     * @returns boolean Succès de l'opération.
     */
    async updateStoreRouting(store: Store, reload = true): Promise<boolean> {
        const logs = new Logs(`RoutingService.updateStoreRouting (${store.id})`);
        if (!(await ensureNginxDirsExist())) return false;

        const { BASE_ID } = serviceNameSpace(store.id); // BASE_ID = store.id ici
        const confFileName = `${BASE_ID}.conf`;
        const confFilePathAvailable = path.join(NGINX_SITES_AVAILABLE, confFileName);
        const confFilePathEnabled = path.join(NGINX_SITES_ENABLED, confFileName);

        let domain_names: string[] = [];
            domain_names = store.domain_names;
        
        // Si pas de domain_names, on supprime la conf et on sort
        if (domain_names.length === 0) {
            return this.removeStoreRoutingById(BASE_ID, reload); // Utilise la fonction de suppression
        }

        // --- Génération de la Configuration ---
        // On a besoin du nom du service Swarm du thème pour ce store
        const themeId = store.current_theme_id || ''; // ID du thème, ou vide si thème par défaut (API)
        const themeServiceName = themeId ? `theme_${themeId}` : `api_store_${store.id}`; // Nom du service Swarm à cibler

        // On a besoin du port interne que le service (thème ou API) écoute
        let targetPort: number;
        try {
            // Inspecter le service Swarm pour trouver le port cible (ou lire depuis DB Theme/Api ?)
            const serviceInfo = await SwarmService.inspectService(themeServiceName);
            if (!serviceInfo) {
                throw new Error(`Service Swarm '${themeServiceName}' non trouvé pour le store ${store.id}`);
            }
            // Cherche le port DANS le conteneur (TargetPort). C'est complexe car il peut y en avoir plusieurs.
            // On suppose ici qu'il y a un seul port pertinent exposé INTERNEMENT.
            // Solution plus simple : Stocker le port interne dans les modèles Api/Theme !
            if (themeId) {
                const theme = await Theme.find(themeId);
                targetPort = theme ? parseInt(theme.internal_port.toString()) : 80; // Port par défaut ou erreur
            } else {
                const api = await Api.find('default'); // Besoin du modèle Api ! Supposons 'default' pour l'instant
                targetPort = api ? parseInt(api.internal_port.toString()) : 3334; // Port par défaut ou erreur
            }
            // TEMPORAIRE : En attendant les modèles Api/Theme, on hardcode des ports
            // //SUPER_TODO
            //targetPort = themeId ? 3000 : 3334; // A remplacer !! 
            if (!targetPort) throw new Error(`Port interne non trouvé pour le service ${themeServiceName}`);


        } catch (inspectError) {
            logs.notifyErrors(`❌ Erreur inspection Swarm/DB pour le port interne de '${themeServiceName}'`, {}, inspectError);
            return false;
        }


        const nginxConfig = `
# Config for Store ${store.id} - Domains: ${domain_names.join(', ')}
# Targets Swarm Service: ${themeServiceName} on port ${targetPort}

# upstream ${themeServiceName}_upstream { # Plus nécessaire avec le DNS Swarm
#    # Swarm DNS handles load balancing
# }

server {
    listen 80;
    # listen [::]:80; # Décommenter si IPv6 est activé et configuré
    server_name ${domain_names.join(' ')};

    # Logs spécifiques (optionnel)
    # access_log /var/log/nginx/store_${BASE_ID}.access.log;
    # error_log /var/log/nginx/store_${BASE_ID}.error.log;

    location / {
        # Utilise le resolver interne de Docker (127.0.0.11) pour résoudre le nom du service Swarm
        resolver 127.0.0.11 valid=10s;
        set $target_service http://${themeServiceName}:${targetPort};

        proxy_pass $target_service; # Passe au service Swarm découvert par DNS

        # Headers importants pour que l'app backend connaisse le client original
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Configuration WebSocket (si nécessaire)
        # proxy_http_version 1.1;
        # proxy_set_header Upgrade $http_upgrade;
        # proxy_set_header Connection "upgrade";

        # Timeouts (optionnel)
        # proxy_connect_timeout 60s;
        # proxy_send_timeout 60s;
        # proxy_read_timeout 60s;
    }

    # TODO: Ajouter la configuration SSL/TLS (Certbot, etc.) ici pour le listen 443
    # listen 443 ssl http2;
    # server_name ${domain_names.join(' ')};
    # ssl_certificate /etc/letsencrypt/live/${domain_names[0]}/fullchain.pem; # Exemple
    # ssl_certificate_key /etc/letsencrypt/live/${domain_names[0]}/privkey.pem; # Exemple
    # include /etc/letsencrypt/options-ssl-nginx.conf; # Maintenu par Certbot
    # ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem; # Maintenu par Certbot

    # location / { ... même configuration proxy_pass ... }
}
`;
        // --- Écriture et Activation ---
        try {
            logs.log(`📝 Écriture du fichier de configuration: ${confFilePathAvailable}`);
            await fs.writeFile(confFilePathAvailable, nginxConfig, { encoding: 'utf8' });

            logs.log(`🔗 Activation du site (lien symbolique)...`);
            try {
                await fs.unlink(confFilePathEnabled); // Supprime l'ancien lien s'il existe
            } catch (unlinkError: any) {
                if (unlinkError.code !== 'ENOENT') throw unlinkError; // Ignore si le lien n'existe pas
            }
            await fs.symlink(confFilePathAvailable, confFilePathEnabled);
            logs.log(`✅ Configuration Nginx pour le store ${store.id} mise à jour.`);

            // Recharger Nginx si demandé
            if (reload) {
                return await reloadNginx();
            }
            return true;

        } catch (error) {
            logs.notifyErrors(`❌ Erreur lors de l'écriture ou de l'activation de la config Nginx pour ${store.id}`, {}, error);
            return false;
        }
    }

    /**
     * Supprime la configuration Nginx pour un store spécifique.
     *
     * @param storeId L'ID du store (ou BASE_ID).
     * @param reload Optionnel (défaut: true). Indique s'il faut recharger Nginx après.
     * @returns boolean Succès de l'opération.
     */
    async removeStoreRoutingById(storeId: string, reload = true): Promise<boolean> {
        const logs = new Logs(`RoutingService.removeStoreRoutingById (${storeId})`);
        if (!(await ensureNginxDirsExist())) return false;

        const confFileName = `${storeId}.conf`;
        const confFilePathAvailable = path.join(NGINX_SITES_AVAILABLE, confFileName);
        const confFilePathEnabled = path.join(NGINX_SITES_ENABLED, confFileName);
        let removedAvailable = false;
        let removedEnabled = false;

        try {
            logs.log(`🗑️ Suppression du fichier Nginx (available): ${confFilePathAvailable}`);
            await fs.unlink(confFilePathAvailable);
            removedAvailable = true;
        } catch (error: any) {
            if (error.code !== 'ENOENT') {
                logs.notifyErrors(`❌ Erreur suppression ${confFilePathAvailable}`, {}, error);
            } else {
                logs.log(`ℹ️ Fichier ${confFilePathAvailable} déjà supprimé.`);
                removedAvailable = true; // Considérez comme réussi si inexistant
            }
        }

        try {
            logs.log(`🗑️ Suppression du lien Nginx (enabled): ${confFilePathEnabled}`);
            await fs.unlink(confFilePathEnabled);
            removedEnabled = true;
        } catch (error: any) {
            if (error.code !== 'ENOENT') {
                logs.notifyErrors(`❌ Erreur suppression lien ${confFilePathEnabled}`, {}, error);
            } else {
                logs.log(`ℹ️ Lien ${confFilePathEnabled} déjà supprimé.`);
                removedEnabled = true;
            }
        }

        // Si au moins un fichier a été effectivement supprimé (ou n'existait plus), on recharge
        if (removedAvailable && removedEnabled && reload) {
            return await reloadNginx();
        }
        // S'il n'y avait rien à supprimer ou si reload=false, on retourne true si aucune autre erreur
        return !logs.errors.length;
    }

    /**
    * Met à jour le fichier server.conf principal pour le domaine sublymus.com.
    * Il liste les locations /store_name qui pointent vers les services Swarm des thèmes/API.
    *
    * @param reload Optionnel (défaut: true). Indique s'il faut recharger Nginx après.
    * @returns boolean Succès de l'opération.
    */
    async updateServerRouting(reload = true): Promise<boolean> {
        const logs = new Logs('RoutingService.updateServerRouting');
        if (!(await ensureNginxDirsExist())) return false;

        const confFileName = `${SERVER_CONF_NAME}.conf`;
        const confFilePathAvailable = path.join(NGINX_SITES_AVAILABLE, confFileName);
        const confFilePathEnabled = path.join(NGINX_SITES_ENABLED, confFileName);
        const mainDomain = env.get('SERVER_DOMAINE', 'sublymus_server.com');
        const backendHost = env.get('HOST', '0.0.0.0'); // Host du serveur Adonis principal (s_server)
        const backendPort = env.get('PORT', '5555');   // Port du serveur Adonis principal

        try {
            logs.log(`⚙️ Génération de la configuration Nginx pour le domaine principal ${mainDomain}...`);
            const stores = await Store.query().where('is_active', true); // Récupère tous les stores actifs

            let locationsBlocks = '';

            for (const store of stores) {
                const themeId = store.current_theme_id || '';
                const themeServiceName = themeId ? `theme_${themeId}` : `api_store_${store.id}`;

                // Récupérer le port interne (comme dans updateStoreRouting)
                let targetPort: number;
                try {
                    // Solution 1 : Lire depuis la DB (préférable)
                    if (themeId) {
                        const theme = await Theme.find(themeId);
                        targetPort = theme ? parseInt(theme.internal_port.toString()) : 80; // Port par défaut ou erreur
                    } else {
                        const api = await Api.find('default'); // Modèle Api nécessaire !
                        targetPort = api ? parseInt(api.internal_port.toString()) : 3334; // Port par défaut ou erreur
                    }
                    if (!targetPort) throw new Error(`Port interne non trouvé pour le service ${themeServiceName}`);
                    // TEMPORAIRE:
                    // targetPort = themeId ? 3000 : 3334;

                } catch (portError) {
                    logs.logErrors(`⚠️ Impossible de déterminer le port pour ${themeServiceName} (store ${store.id}), location non ajoutée.`, {}, portError);
                    continue; // Passe au store suivant
                }


                // Création du bloc location /store_name
                // Note: Nginx fait correspondre "/nom/" mais pas "/nom". L'ajout du / final est important
                locationsBlocks += `
    # Location for Store: ${store.name} (${store.id}) -> ${themeServiceName}:${targetPort}
    location /${store.name}/ {
        resolver 127.0.0.11 valid=10s;
        set $target_service http://${themeServiceName}:${targetPort};

        proxy_pass $target_service; # Passe au service Swarm

        # Headers
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Réécriture pour enlever le préfixe /store_name/ (si l'app backend ne le gère pas)
        # proxy_rewrite ^/${store.name}/(.*)$ /$1 break; # Dépend du thème/API // TODO comprendre cette partie
    }
`;
            }

            const nginxConfig = `
# Config for Main Domain: ${mainDomain}
# Points to s_server backend: ${backendHost}:${backendPort}
# Includes locations for active stores

server {
    listen 80;
    # listen [::]:80;
    server_name ${mainDomain};

    # access_log /var/log/nginx/${SERVER_CONF_NAME}.access.log;
    # error_log /var/log/nginx/${SERVER_CONF_NAME}.error.log;

    # Location pour le serveur principal (s_server / interface admin, etc.)
    location / {
        # Pas besoin de resolver ici si on pointe vers localhost ou une IP fixe
        proxy_pass http://${backendHost}:${backendPort}; # Pointe vers s_server lui-même

        # Headers
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # --- Locations pour les Stores Actifs ---
    ${locationsBlocks}

    # TODO: Config SSL/TLS pour le domaine principal
}
`;
            // --- Écriture et Activation ---
            logs.log(`📝 Écriture du fichier de configuration: ${confFilePathAvailable}`);
            await fs.writeFile(confFilePathAvailable, nginxConfig, { encoding: 'utf8' });

            logs.log(`🔗 Activation du site principal (lien symbolique)...`);
            try {
                await fs.unlink(confFilePathEnabled);
            } catch (unlinkError: any) {
                if (unlinkError.code !== 'ENOENT') throw unlinkError;
            }
            await fs.symlink(confFilePathAvailable, confFilePathEnabled);
            logs.log('✅ Configuration Nginx principale mise à jour.');

            if (reload) {
                return await reloadNginx();
            }
            return true;

        } catch (error) {
            logs.notifyErrors(`❌ Erreur lors de la mise à jour de la config Nginx principale`, {}, error);
            return false;
        }
    }

    async removeAllManagedRouting(reload = true): Promise<boolean> {
        const logs = new Logs('RoutingService.removeAllManagedRouting');
        if (!(await ensureNginxDirsExist())) return false;
        let allSuccess = true;

        logs.log('🧹 Suppression des configurations Nginx gérées par Sublymus...');

        // Supprime la conf principale
        logs.log(`🔧 Suppression de la configuration principale (${SERVER_CONF_NAME})`);
        const mainConfSuccess = await this.removeStoreRoutingById(SERVER_CONF_NAME, false);
        allSuccess = mainConfSuccess && allSuccess;

        // Supprime les confs des stores
        const stores = await Store.all();
        for (const store of stores) {
            logs.log(`🔧 Suppression de la configuration du store ${store.id}`);
            const success = await this.removeStoreRoutingById(store.id, false);
            allSuccess = success && allSuccess;
        }

        if (reload) {
            logs.log('🔄 Rechargement de Nginx...');
            const reloadSuccess = await reloadNginx();
            allSuccess = reloadSuccess && allSuccess;
        } else {
            logs.log('⚠️ Rechargement de Nginx non demandé (reload = false)');
        }

        if (allSuccess) {
            logs.log('✅ Toutes les configurations ont été supprimées avec succès.');
        } else {
            logs.notifyErrors('❌ Certaines configurations n’ont pas pu être supprimées correctement.');
        }

        return allSuccess;
    }
}


// Exporte une instance unique
export default new RoutingService()