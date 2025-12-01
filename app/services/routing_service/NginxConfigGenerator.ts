// s_server/app/services/routing_service/NginxConfigGenerator.ts
import Store from '#models/store';
import Theme from '#models/theme';
import Api from '#models/api';
import {
    TARGET_API_HEADER,
    BASE_URL_HEADER,
    SERVER_URL_HEADER,
    PLATFORM_MAIN_DOMAIN,
    SERVER_API_URL_HEADER,
    STORE_API_URL_HEADER
} from './utils.js'; // Importer les constantes nécessaires
import { devIp, http, isProd } from '../../Utils/functions.js';
import env from '#start/env';

// import env from '#start/env'; // Pour lire les noms des services globaux

// Interface pour la configuration d'une application globale (s_welcome, etc.)
// Tu pourrais enrichir cela plus tard, ex: si certaines apps ont besoin de headers spécifiques
export interface GlobalAppConfig {
    domain: string;         // Ex: "sublymus.com" ou "dash.sublymus.com"
    serviceNameInSwarm: string; // Ex: "s_welcome", "s_dashboard"
    servicePort: number;    // Port interne du service Swarm (ex: 3000, 3005)
    isStoreHost?: boolean; // permet de savoir si on doit injecter le x-base-url
    removeDefaultLoaction?: boolean,
    loactionList?: string[] | string// Optionnel: injecter X-Target-Api-Service si cette app globale en a besoin
    targetApiService?: string; // Ex: "api_store_default_ou_un_service_api_global"
}

// const WindowDevIp = '172.25.64.1';
const WindowDevIp = devIp;

// const devApiPort = 3334
export class NginxConfigGenerator {

    constructor() { }

    /**
     * Génère les directives SSL communes pour un virtual host.
     * @param domain Le domaine pour lequel les certificats sont émis (ex: "sublymus.com")
     */
    private generateSslDirectives(domainForCerts: string): string {
        // Pour un certificat wildcard, domainForCerts serait ton domaine principal (ex: "sublymus.com")
        // car le certificat wildcard couvre *.sublymus.com ET sublymus.com.
        return `
    listen 443 ssl;
    listen [::]:443 ssl;
    #http2 on; 
    ssl_certificate /etc/letsencrypt/live/${domainForCerts}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${domainForCerts}/privkey.pem;
    # include /etc/nginx/snippets/ssl-params.conf; # Si tu as un fichier de paramètres SSL communs
    # Recommandé: Ajouter ici les paramètres ssl_protocols, ssl_ciphers, etc. ou les inclure via un snippet
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;
    # HSTS (décommenter après tests approfondis)
    # add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
`;
    }

    /**
     * Génère les directives de proxy_pass communes.
     * @param targetServiceName Le nom du service Docker Swarm cible (ex: "s_welcome", "theme_xyz", "api_store_abc")
     * @param targetServicePort Le port interne du service cible
     */
    private generateProxyPassDirectives(targetServiceName: string, targetServicePort: number): string {
        const resolverDirective = isProd ? '        resolver 127.0.0.11 valid=10s;\n' : '';
        const targetServiceUrl = `http://${targetServiceName}:${targetServicePort}`;

        return `
${resolverDirective}        set $target_service ${targetServiceUrl};

        client_max_body_size 50M;
        
        proxy_pass ${isProd ? '$target_service' : targetServiceUrl};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off; # Peut être utile pour les applications avec SSE ou streaming
`;
    }

    /**
     * Génère la configuration Nginx pour un store spécifique (ses domaines custom).
     * @param store Le Store concerné.
     * @param theme Le Thème actif du store (ou null si aucun thème / direct vers API).
     * @param api L'API backend du store.
     */
    public generateStoreCustomDomainVHostConfig(store: Store, theme: Theme | null, api: Api): string | null {

        const serverNameLine = [...store.domain_names, store.default_domain].join(' ');
        const targetServiceName = isProd ? (theme ? `theme_${theme.id}` : `api_store_${store.id}`) : WindowDevIp;
        const targetServicePort = theme ? theme.internal_port : api.internal_port;

        let headersInjection = '';
        if (theme) { // Si la cible est un thème, on injecte le header pour l'API cible
            headersInjection += `        proxy_set_header ${STORE_API_URL_HEADER} ${http}api.${PLATFORM_MAIN_DOMAIN}/${store.id};\n`;
            headersInjection += `        proxy_set_header ${BASE_URL_HEADER} ${store.default_domain};\n`;
        }
        headersInjection += `        proxy_set_header ${SERVER_URL_HEADER} ${http}${PLATFORM_MAIN_DOMAIN};\n`;
        headersInjection += `        proxy_set_header ${SERVER_API_URL_HEADER} ${http}server.${PLATFORM_MAIN_DOMAIN};\n`;        
        headersInjection += `        proxy_set_header  x-store-id ${store.id};\n`;        

        return `
# Config pour Store ID: ${store.id} - Nom: ${store.name}
# Domaines Custom: ${serverNameLine}
# Cible: ${targetServiceName}:${targetServicePort}

server {
    # Utilise le certificat wildcard du domaine principal
    ${isProd ? this.generateSslDirectives(PLATFORM_MAIN_DOMAIN) : 
    `listen 80 ;
        listen [::]:80 ;`} 

    server_name ${serverNameLine};

    # Logs spécifiques au store (optionnel)
    # access_log /var/log/nginx/store_${store.id}_custom.access.log;
    # error_log /var/log/nginx/store_${store.id}_custom.error.log;

    location / {
        ${this.generateProxyPassDirectives(targetServiceName, targetServicePort)}
        ${headersInjection}
    }

    # Redirection HTTP vers HTTPS pour ces domaines (si nécessaire, le  peut déjà le faire)
    # server {
    #    listen 80;
    #    server_name ${serverNameLine};
    #    return 301 https://$host$request_uri;
    # }
}
`;
    }

    /**
     * Génère le bloc location pour les webhooks Wave.
     * @param webhookPath Chemin du webhook (par défaut: /webhook/wave/)
     * @param rewritePath Chemin de réécriture optionnel (si différent du webhookPath)
     */
    public generateWalletBlock(webhookPath: string = '/webhook/wave/', rewritePath?: string): string {
        // Normaliser le path : accepter avec ou sans slash final
        const normalizedPath = webhookPath.endsWith('/') ? webhookPath.slice(0, -1) : webhookPath;
        const locationPath = `${normalizedPath}/`;
        // Réécrire pour enlever le slash final avant de proxy vers l'API
        const rewriteDirective = rewritePath 
            ? `        rewrite ^${locationPath}(.*)$ ${rewritePath}$1 break;\n` 
            : `        rewrite ^${locationPath}(.*)$ ${normalizedPath}$1 break;\n`;
        
        return `
    location ${locationPath} {
        ${rewriteDirective}${this.generateProxyPassDirectives(isProd ? env.get('WAVE_API_SERVICE_NAME', 'wave_api') : devIp, 3333)}
    }
`;
    }

    /**
     * Génère UN SEUL bloc `location /store-slug/ { ... }` pour le fichier serveur principal.
     * @param store Le Store concerné.
     * @param theme Le Thème actif du store (ou null).
     * @param api L'API backend du store.
     */
    public  generateApiStoreLocationBlock(s_api_port: number): string {
        // Regex pour capturer un UUID v4 dans le premier segment du chemin
        // $1 sera l'UUID (store_id), $2 sera le reste du chemin (ex: /products, /orders, ou vide)
        // Le (.*)? rend le chemin après l'UUID optionnel.
        // const uuidRegex = "([0-9a-fA-F]{8}-([0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12})";
        const uuidRegex = `([^/]+)`;

        return `
    # Route dynamique pour les API des stores via /<store_id_uuid>/...
    location ~  ^/${uuidRegex}(/.*)?$  {
        set $store_id_capture $1;
        set $request_path_capture $2;

        ${isProd ? 'resolver 127.0.0.11 valid=10s;' : ''}
    
        set $target_api_service_store http://${isProd ? 'api_store_$store_id_capture' : devIp}:${s_api_port};
        rewrite ^/${uuidRegex}(/.*)?$ $2 break;
        proxy_pass $target_api_service_store$request_path_capture$is_args$args;

        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_buffering off; 
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header ${SERVER_URL_HEADER} ${http}${PLATFORM_MAIN_DOMAIN};
        proxy_set_header ${SERVER_API_URL_HEADER} ${http}server.${PLATFORM_MAIN_DOMAIN};
    }

    location / {
        return 404 '{"error": "API endpoint not found"}'; # Réponse JSON pour une API
        # Ou si tu as une page d'atterrissage pour api.sublymus.com :
        # resolver 127.0.0.11 valid=10s;
        # set $target_api_landing http://s_api_docs_or_landing_service:port;
        # proxy_pass $target_api_landing;
        # ... headers proxy ...
    }
`;
    }

    /**
     * Génère la configuration Nginx principale pour la plateforme.
     * @param storesSlugBlocks Les blocs `location /slug/ {}` générés pour chaque store actif.
     * @param globalAppsConfigs Configuration pour les applications globales (s_welcome, etc.).
     */
    public generateGlobalAppsConfig(
        globalAppsConfigs: GlobalAppConfig[]
    ): string {
        let globalAppsServerBlocks = '';

        for (const app of globalAppsConfigs) {
            let headers = '';
            if (app.targetApiService) { // Pour s_dashboard, s_docs si elles appellent une API
                headers += `proxy_set_header ${TARGET_API_HEADER} ${app.targetApiService};\n`;
            }
            if (app.isStoreHost) headers += `            proxy_set_header ${BASE_URL_HEADER} ${http}${app.domain}/;\n`; // URL de base de l'app
            headers += `            proxy_set_header ${SERVER_URL_HEADER} ${http}${PLATFORM_MAIN_DOMAIN};\n`;
            headers += `            proxy_set_header ${SERVER_API_URL_HEADER} ${http}server.${PLATFORM_MAIN_DOMAIN};\n`;


            globalAppsServerBlocks += `
# Application Globale: ${app.serviceNameInSwarm} sur ${http}${app.domain}
server {
    # Utilise le certificat wildcard du domaine principal
    ${isProd ? this.generateSslDirectives(PLATFORM_MAIN_DOMAIN) : `listen 80 ;
        listen [::]:80 ;`} 

    server_name ${app.domain};

    # location /.well-known/acme-challenge/ { # Garder pour le renouvellement si HTTP-01 utilisé pour ces domaines
    #     root /var/www/certbot_http_challenge_main; # Un chemin partagé avec Certbot
    # }

    ${!app.removeDefaultLoaction ? (
                    `
    location / {
        ${this.generateProxyPassDirectives(app.serviceNameInSwarm, app.servicePort)}
        ${headers}
    }
            `
                ) : ''
                }
    
    ${app.loactionList ? (
                    Array.isArray(app.loactionList) ? app.loactionList.join('\n\n') : app.loactionList
                ) : ''
                }
}

# Redirection HTTP vers HTTPS pour cette application globale
${isProd ? `
server {
    listen 80;
    server_name ${app.domain};
    # location /.well-known/acme-challenge/ {
    #     root /var/www/certbot_http_challenge_main;
    # }
    location / {
        return 301 https://$host$request_uri;
    }
}`: ''}
`;
        }

        const welcomeAppConfig = globalAppsConfigs.find(app => app.domain === PLATFORM_MAIN_DOMAIN);

        let mainDomainRootHeaders = `proxy_set_header ${SERVER_URL_HEADER} ${http}${PLATFORM_MAIN_DOMAIN};\n`;
        mainDomainRootHeaders += `proxy_set_header ${SERVER_API_URL_HEADER} ${http}server.${PLATFORM_MAIN_DOMAIN};\n`;
        if (welcomeAppConfig) {
            if (welcomeAppConfig.isStoreHost) mainDomainRootHeaders += `proxy_set_header ${BASE_URL_HEADER} ${http}${welcomeAppConfig.domain}/;\n`;
            if (welcomeAppConfig.targetApiService) mainDomainRootHeaders += `proxy_set_header ${TARGET_API_HEADER} ${welcomeAppConfig.targetApiService};\n`;


        }

        return `
# Fichier de configuration Nginx principal pour la plateforme Sublymus
# Généré le: ${new Date().toISOString()}

${globalAppsServerBlocks}

`;
    }

    
public generatePreviewDomainConfig(sServerInternalUrl: string): string {
  const sServerProxyEndpoint = `${sServerInternalUrl}/v1/internal-theme-preview-proxy`;

  return `
    location / {
        proxy_pass ${sServerProxyEndpoint}$request_uri;
    
        client_max_body_size 50M;
    
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_buffering off; 
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header ${SERVER_URL_HEADER} ${http}${PLATFORM_MAIN_DOMAIN};
    }
  `;
}

}