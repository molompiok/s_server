// s_server/app/services/routing_service/NginxConfigGenerator.ts
import Store from '#models/store';
import Theme from '#models/theme';
import Api from '#models/api';
import {
    TARGET_API_HEADER,
    BASE_URL_HEADER,
    SERVER_URL_HEADER,
    PLATFORM_MAIN_DOMAIN,
    SERVER_API_URL_HEADER
} from './utils.js'; // Importer les constantes nécessaires
import env from '#start/env';
// import env from '#start/env'; // Pour lire les noms des services globaux

// Interface pour la configuration d'une application globale (s_welcome, etc.)
// Tu pourrais enrichir cela plus tard, ex: si certaines apps ont besoin de headers spécifiques
export interface GlobalAppConfig {
    domain: string;         // Ex: "sublymus.com" ou "dash.sublymus.com"
    serviceNameInSwarm: string; // Ex: "s_welcome", "s_dashboard"
    servicePort: number;    // Port interne du service Swarm (ex: 3000, 3005)
    isStoreHost?:boolean; // permet de savoir si on doit injecter le x-base-url
    // Optionnel: injecter X-Target-Api-Service si cette app globale en a besoin
    targetApiService?: string; // Ex: "api_store_default_ou_un_service_api_global"
}

const isProd = env.get('NODE_ENV') =='production'
const http = isProd ? 'https://':'http://'
const devIp = '172.25.72.235'
const devApiPort = 3334
export class NginxConfigGenerator {

    constructor() {}

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
        return `
        resolver 127.0.0.11 valid=10s; # Résolveur DNS interne de Docker Swarm
        set $target_service http://${targetServiceName}:${targetServicePort};

        proxy_pass $target_service;
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
        if (!store.domain_names || store.domain_names.length === 0) {
            return null; // Pas de domaines custom, pas de fichier de conf spécifique pour eux.
        }

        const serverNameLine = store.domain_names.join(' ');
        const targetServiceName = isProd? (theme ? `theme_${theme.id}` : `api_store_${store.id}`) : devIp;
        const targetServicePort = isProd? (theme ? theme.internal_port : api.internal_port):devApiPort;

        let headersInjection = '';
        if (theme) { // Si la cible est un thème, on injecte le header pour l'API cible
            headersInjection += `proxy_set_header ${TARGET_API_HEADER} http://api_store_${store.id}:${isProd?api.internal_port:devApiPort};\n`;
             // Le thème a besoin de connaître son URL de base pour construire les assets, etc.
            // Pour un domaine custom, l'URL de base est la racine du domaine.
            headersInjection += `        proxy_set_header ${BASE_URL_HEADER} ${store.domain_names[0]};\n`; // Utilise le premier domaine custom comme référence
        }
        headersInjection += `        proxy_set_header ${SERVER_URL_HEADER} ${PLATFORM_MAIN_DOMAIN};\n`;
        headersInjection += `        proxy_set_header ${SERVER_API_URL_HEADER} server.${PLATFORM_MAIN_DOMAIN};\n`;


        return `
# Config pour Store ID: ${store.id} - Nom: ${store.name}
# Domaines Custom: ${serverNameLine}
# Cible: ${targetServiceName}:${targetServicePort}

server {
    ${isProd?this.generateSslDirectives(PLATFORM_MAIN_DOMAIN):'listen 80;'} # Utilise le certificat wildcard du domaine principal

    server_name ${serverNameLine};

    # Logs spécifiques au store (optionnel)
    # access_log /var/log/nginx/store_${store.id}_custom.access.log;
    # error_log /var/log/nginx/store_${store.id}_custom.error.log;

    location / {
        ${this.generateProxyPassDirectives(targetServiceName, targetServicePort)}
        ${headersInjection}
    }

    # Redirection HTTP vers HTTPS pour ces domaines (si nécessaire, le default_server peut déjà le faire)
    # server {
    #    listen 80;
    #    server_name ${serverNameLine};
    #    return 301 https://$host$request_uri;
    # }
}
`;
    }


    /**
     * Génère UN SEUL bloc `location /store-slug/ { ... }` pour le fichier serveur principal.
     * @param store Le Store concerné.
     * @param theme Le Thème actif du store (ou null).
     * @param api L'API backend du store.
     */
    public generateStoreSlugLocationBlock(store: Store, theme: Theme | null, api: Api): string {
        const targetServiceName = isProd?(theme ? `theme_${theme.id}` : `api_store_${store.id}`) : devIp;
        const targetServicePort = isProd?( theme ? theme.internal_port : api.internal_port) : devApiPort;

        let headersInjection = '';
        let rewriteRule = '';
        // let proxyPassTarget = `$target_service`; // Par défaut, pas de / final

        if (theme) {
            headersInjection += `proxy_set_header ${TARGET_API_HEADER} http://api_store_${store.id}:${api.internal_port};\n`;
            // Pour un slug, l'URL de base pour le thème est /store-slug/
            // Vike (ou autre framework SSR) doit être configuré pour gérer cette base URL.
            headersInjection += `            proxy_set_header ${BASE_URL_HEADER} /${store.slug}/;\n`;
            // proxyPassTarget = `$target_service/`; // IMPORTANT: Ajoute le / final si on rewrite pour un thème
            // ATTENTION: Le rewriteRule ci-dessous et le proxy_pass $target_service/ peuvent causer des doubles slashes
            // si le thème attend déjà des paths relatifs à la racine. A tester et ajuster.
            // Une solution plus propre est que le thème soit conscient de son base path via une variable d'env
            // et que Nginx ne fasse que proxyfier vers la racine du service thème.
            // Pour l'instant, on ne fait PAS de rewrite, on suppose que le thème gère /slug/ internally
            // OU que le service thème est configuré pour écouter sur /
        }
         headersInjection += `            proxy_set_header ${SERVER_URL_HEADER} ${PLATFORM_MAIN_DOMAIN};\n`;
         headersInjection += `        proxy_set_header ${SERVER_API_URL_HEADER} server.${PLATFORM_MAIN_DOMAIN};\n`;

        // Le slug du store est utilisé comme chemin de base.
        // Nginx doit transmettre les requêtes à la racine du service cible.
        // Par exemple, une requête à `main_domain.com/store-slug/products`
        // doit arriver comme `/products` au service `theme_XYZ` ou `api_store_XYZ`.
        // Mais si le service lui-même est une SPA ou SSR qui ne s'attend pas au préfixe, il faut le retirer.
        // Si Vike est configuré avec `base: '/${store.slug}/'`, alors pas besoin de rewrite ici.
        // Sinon, il faut un rewrite. Supposons pour l'instant que le service cible s'attend à la requête SANS le slug.
        rewriteRule = `rewrite ^/${store.slug}(/.*)$ $1 break; # Enlève le /store-slug/
                       rewrite ^/${store.slug}$ / break;      # Gère la racine /store-slug/ -> /`;


        return `
    # Store: ${store.name} (ID: ${store.id}) - Slug: /${store.slug}/
    # Cible: ${targetServiceName}:${targetServicePort}
    location ~ ^/${store.slug}(/.*)?$ { # ~ pour regex, (?...) pour optionnel trailing slash
        ${this.generateProxyPassDirectives(targetServiceName, targetServicePort)}
        ${headersInjection}
        ${rewriteRule}
    }
`;
    }

    /**
     * Génère la configuration Nginx principale pour la plateforme.
     * @param storesSlugBlocks Les blocs `location /slug/ {}` générés pour chaque store actif.
     * @param globalAppsConfigs Configuration pour les applications globales (s_welcome, etc.).
     */
    public generateMainPlatformConfig(
        _storesSlugBlocks: string,
        globalAppsConfigs: GlobalAppConfig[]
    ): string {
        let globalAppsServerBlocks = '';

        for (const app of globalAppsConfigs) {
            let headers = '';
            if (app.targetApiService) { // Pour s_dashboard, s_docs si elles appellent une API
                headers += `proxy_set_header ${TARGET_API_HEADER} ${app.targetApiService};\n`;
            }
            if(app.isStoreHost) headers += `            proxy_set_header ${BASE_URL_HEADER} ${http}${app.domain}/;\n`; // URL de base de l'app
            headers += `            proxy_set_header ${SERVER_URL_HEADER} ${PLATFORM_MAIN_DOMAIN};\n`;
            headers += `            proxy_set_header ${SERVER_API_URL_HEADER} server.${PLATFORM_MAIN_DOMAIN};\n`;


            globalAppsServerBlocks += `
# Application Globale: ${app.serviceNameInSwarm} sur ${app.domain}
server {
    ${isProd? this.generateSslDirectives(PLATFORM_MAIN_DOMAIN):' listen 80;'} # Utilise le certificat wildcard du domaine principal

    server_name ${app.domain};

    # location /.well-known/acme-challenge/ { # Garder pour le renouvellement si HTTP-01 utilisé pour ces domaines
    #     root /var/www/certbot_http_challenge_main; # Un chemin partagé avec Certbot
    # }

    location / {
        ${this.generateProxyPassDirectives(app.serviceNameInSwarm, app.servicePort)}
        ${headers}
    }
}

# Redirection HTTP vers HTTPS pour cette application globale
${isProd?`
server {
    listen 80;
    server_name ${app.domain};
    # location /.well-known/acme-challenge/ {
    #     root /var/www/certbot_http_challenge_main;
    # }
    location / {
        return 301 https://$host$request_uri;
    }
}`:''}
`;
        }

        // Serveur principal pour le domaine de base (ex: sublymus.com) qui gère les slugs
        // et potentiellement une des apps globales (ex: s_welcome).
        // Ici, on suppose que s_welcome est sur sublymus.com ET que les slugs sont aussi sur sublymus.com.
        // Si s_welcome est la cible de PLATFORM_MAIN_DOMAIN, on la met en proxy_pass pour /
        const welcomeAppConfig = globalAppsConfigs.find(app => app.domain === PLATFORM_MAIN_DOMAIN);
//         let mainDomainRootLocation = `
//         # Emplacement racine par défaut pour ${PLATFORM_MAIN_DOMAIN}
//         # S'il n'est pas géré par une app globale spécifique (ex: s_welcome)
//         # ou un slug de store, on peut retourner une page statique ou une erreur.
//         return 404; # Ou une page d'accueil statique de Sublymus
// `;
        let mainDomainRootHeaders = `proxy_set_header ${SERVER_URL_HEADER} ${PLATFORM_MAIN_DOMAIN};\n`;
        mainDomainRootHeaders += `proxy_set_header ${SERVER_API_URL_HEADER} server.${PLATFORM_MAIN_DOMAIN};\n`;
        if (welcomeAppConfig) {
            if(welcomeAppConfig.isStoreHost) mainDomainRootHeaders += `proxy_set_header ${BASE_URL_HEADER} ${http}${welcomeAppConfig.domain}/;\n`;
            if(welcomeAppConfig.targetApiService) mainDomainRootHeaders += `proxy_set_header ${TARGET_API_HEADER} ${welcomeAppConfig.targetApiService};\n`;

//             mainDomainRootLocation = `
//         ${this.generateProxyPassDirectives(welcomeAppConfig.serviceNameInSwarm, welcomeAppConfig.servicePort)}
//         ${mainDomainRootHeaders}
// `;
        }

//         const mainServerBlock = `
// # Serveur principal pour ${PLATFORM_MAIN_DOMAIN} (gère les slugs et la racine)
// server {
//     ${this.generateSslDirectives(PLATFORM_MAIN_DOMAIN)}

//     server_name ${PLATFORM_MAIN_DOMAIN};

//     # Logs (optionnel)
//     # access_log /var/log/nginx/platform_main.access.log;
//     # error_log /var/log/nginx/platform_main.error.log;

//     # Priorité aux slugs des stores
//     ${storesSlugBlocks}

//     location / {
   
//         resolver 127.0.0.11 valid=10s; # Résolveur DNS interne de Docker Swarm
//         set $target_service http://s_welcome:3003;

//         proxy_pass $target_service;
//         proxy_http_version 1.1;
//         proxy_set_header Upgrade $http_upgrade;
//         proxy_set_header Connection "upgrade";
//         proxy_set_header Host $host;
//         proxy_set_header X-Real-IP $remote_addr;
//         proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
//         proxy_set_header X-Forwarded-Proto $scheme;
//         proxy_buffering off; # Peut être utile pour les applications avec SSE ou streaming

//         proxy_set_header x-base-url https://sublymus.com/;
//         proxy_set_header x-server-url sublymus.com;
// }
// }

// # Redirection HTTP vers HTTPS pour le domaine principal
// server {
//     listen 80;
//     server_name ${PLATFORM_MAIN_DOMAIN};
//     # location /.well-known/acme-challenge/ {
//     #     root /var/www/certbot_http_challenge_main; # Assurez-vous que ce chemin existe et est servi
//     # }
//     # location / {
//         return 301 https://$host$request_uri;
//     # }
// }
// `;
        return `
# Fichier de configuration Nginx principal pour la plateforme Sublymus
# Généré le: ${new Date().toISOString()}

${globalAppsServerBlocks}

`;
    }
}