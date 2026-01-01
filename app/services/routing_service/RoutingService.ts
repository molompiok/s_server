// s_server/app/services/routing_service/RoutingService.ts
import Store from '#models/store';
import { devIp, isProd, Logs } from '../../Utils/functions.js';
import { GlobalAppConfig, NginxConfigGenerator } from './NginxConfigGenerator.js';
import { NginxFileManager } from './NginxFileManager.js';
import { NginxReloader } from './NginxReloader.js';
import {
    getStoreConfFileName,
    MAIN_SERVER_CONF_FILENAME,
    ensureNginxDirsExistInContainer
} from './utils.js';
import env from '#start/env'; // Pour lire les configurations des apps globales

export class RoutingServiceClass {
    private nginxConfigGenerator: NginxConfigGenerator;
    private nginxFileManager: NginxFileManager;
    private nginxReloader: NginxReloader;
    private logs: Logs; // Instance de Logs pour ce service

    constructor(
        generator: NginxConfigGenerator,
        fileManager: NginxFileManager,
        reloader: NginxReloader,
        parentLogs?: Logs // Optionnel: pour hériter d'un contexte de log parent
    ) {
        this.logs = parentLogs ? parentLogs.fork('RoutingService') : new Logs('RoutingService');
        this.nginxConfigGenerator = generator;
        this.nginxFileManager = fileManager;
        this.nginxReloader = reloader;
        this.logs.log("RoutingService initialisé.");
    }

    private async getGlobalAppsConfig(): Promise<GlobalAppConfig[]> {
        // Lire la configuration des apps globales depuis l'env ou une config dédiée
        // Pour l'instant, on les met en dur pour l'exemple, mais elles devraient venir de env.get()
        // Ces noms de service et ports doivent correspondre à la façon dont ils sont déployés par Swarm
        return [
            { // ----------- deja  definie dans NginxConfigGenerator ou les chemin slug sons gerer a l'interieur -------------
                domain: env.get('SERVER_DOMAINE', 'sublymus.com'), // Domaine principal pour s_welcome
                serviceNameInSwarm: isProd ? env.get('APP_SERVICE_WELCOME', 's_welcome') : devIp,
                servicePort: parseInt(env.get('S_WELCOME_INTERNAL_PORT', '3003')),
                isStoreHost: true
            },
            {
                domain: `dash.${env.get('SERVER_DOMAINE', 'sublymus.com')}`,
                serviceNameInSwarm: isProd ? env.get('APP_SERVICE_DASHBOARD', 's_dashboard') : devIp,
                servicePort: parseInt(env.get('S_DASHBOARD_INTERNAL_PORT', '3005')),
                isStoreHost: true
            },
            {
                domain: `docs.${env.get('SERVER_DOMAINE', 'sublymus.com')}`,
                serviceNameInSwarm: isProd ? env.get('APP_SERVICE_DOCS', 's_docs') : devIp,
                servicePort: parseInt(env.get('S_DOCS_INTERNAL_PORT', '3007')),
                isStoreHost: true
            },
            {
                domain: `admin.${env.get('SERVER_DOMAINE', 'sublymus.com')}`,
                serviceNameInSwarm: isProd ? env.get('APP_SERVICE_ADMIN', 's_admin') : devIp,
                servicePort: parseInt(env.get('S_ADMIN_INTERNAL_PORT', '3008')),
                isStoreHost: true
            },
            {
                domain: `server.${env.get('SERVER_DOMAINE', 'sublymus.com')}`,
                serviceNameInSwarm: isProd ? 's_server' : devIp,
                servicePort: parseInt(env.get('PORT', '5555')),
            },
            {
                domain: `api.${env.get('SERVER_DOMAINE', 'sublymus.com')}`,
                serviceNameInSwarm: isProd ? 's_server' : devIp,
                removeDefaultLoaction: true,   // TODO : le default est retirer ok , mais dans la liste on doir diriger le "/" vers la api docs
                servicePort: parseInt(env.get('S_API_INTERNAL_PORT', '3334')),
                loactionList: this.nginxConfigGenerator.generateApiStoreLocationBlock(parseInt(env.get('S_API_INTERNAL_PORT', '3334')))
            },            {
                domain: `preview.${env.get('SERVER_DOMAINE', 'sublymus.com')}`,
                serviceNameInSwarm: isProd ? 's_server' : devIp,
                servicePort: '5555/v1/internal-theme-preview-proxy$request_uri' as any,
            }
            // {
            //     domain: `preview.${env.get('SERVER_DOMAINE', 'sublymus.com')}`,
            //     serviceNameInSwarm: isProd ? 's_server' : devIp,
            //     removeDefaultLoaction: true,
            //     servicePort: parseInt(env.get('S_API_INTERNAL_PORT', '3334')),
            //     loactionList: this.nginxConfigGenerator.generatePreviewDomainConfig(`http://${isProd?'s_server':'localhost'}:5555`)
            // }
        ];
    }


    async updateStoreCustomDomainRouting(store: Store, triggerReload: boolean = true): Promise<boolean> {
        this.logs.fork(`updateStoreCustomDomainRouting (${store.id})`);
        if (!await ensureNginxDirsExistInContainer(this.logs)) return false;

        const confFileName = getStoreConfFileName(store.id);

        // Précharger les relations nécessaires
        await store.load('currentTheme');
        await store.load('currentApi');

        if (!store.currentApi) {
            this.logs.logErrors(`❌ Store ${store.id} n'a pas d'API courante définie. Impossible de générer la conf Nginx.`);
            return false;
        }

        const configContent = this.nginxConfigGenerator.generateStoreCustomDomainVHostConfig(
            store,
            store.currentTheme, // Peut être null
            store.currentApi
        );

        if (!configContent) {
            this.logs.logErrors(`❌ Échec de la génération de la configuration VHost pour ${store.id}.`);
            return false;
        }

        if (!await this.nginxFileManager.writeConfigFile(confFileName, configContent)) return false;
        if (!await this.nginxFileManager.enableConfig(confFileName)) return false;

        if (triggerReload) {
            await this.nginxReloader.triggerNginxReloadDebounced();
        }
        this.logs.log(`✅ Routage pour domaines custom du store ${store.id} mis à jour.`);
        return true;
    }

    async removeStoreCustomDomainRouting(storeId: string, triggerReload: boolean = true): Promise<boolean> {
        this.logs.fork(`removeStoreCustomDomainRouting (${storeId})`);
        if (!await ensureNginxDirsExistInContainer(this.logs)) return false; // Non critique ici mais bonne pratique

        const confFileName = getStoreConfFileName(storeId);
        const success = await this.nginxFileManager.removeFullConfig(confFileName);

        if (success && triggerReload) {
            await this.nginxReloader.triggerNginxReloadDebounced();
        }
        return success;
    }

    async updateMainPlatformRouting(triggerReload: boolean = true): Promise<boolean> {
        this.logs.fork('updateMainPlatformRouting');
        if (!await ensureNginxDirsExistInContainer(this.logs)) return false;

        try {
            const activeStores = await Store.query()
                .where('is_active', true)
                .preload('currentTheme') // Précharger pour éviter N+1
                .preload('currentApi')   // Précharger pour éviter N+1
                .orderBy('name', 'asc');

            const globalApps = await this.getGlobalAppsConfig();
            const mainConfigContent = this.nginxConfigGenerator.generateGlobalAppsConfig(
                globalApps
            );

            const mainConfFile = MAIN_SERVER_CONF_FILENAME;
            if (!await this.nginxFileManager.writeConfigFile(mainConfFile, mainConfigContent)) return false;
            if (!await this.nginxFileManager.enableConfig(mainConfFile)) return false; // S'assurer qu'il est activé

            if (triggerReload) {
                await this.nginxReloader.triggerNginxReloadDebounced();
            }

            let storesDomainPromise = [];
            for (const store of activeStores) {
                storesDomainPromise.push(this.updateStoreCustomDomainRouting(store, false))
            }
            await Promise.allSettled(storesDomainPromise)

            if (triggerReload) {
                await this.nginxReloader.triggerNginxReloadDebounced();
            }

            this.logs.log(`✅ Configuration Nginx principale de la plateforme mise à jour.`);
            return true;
        } catch (error) {
            this.logs.notifyErrors("❌ Erreur majeure lors de la mise à jour du routage principal de la plateforme", {}, error);
            return false;
        }
    }

    /**
     * Déclenche un rechargement Nginx. Principalement pour usage externe ou tests.
     */
    async triggerNginxReload(): Promise<void> {
        this.logs.fork('triggerNginxReload (manual)');
        await this.nginxReloader.triggerNginxReloadDebounced();
    }

    // L'ancienne removeAllManagedRouting est maintenant plus complexe car elle devrait
    // supprimer tous les fichiers générés (stores + principal).
    // Pour l'instant, on se concentre sur la mise à jour.
}