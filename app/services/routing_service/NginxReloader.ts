// s_server/app/services/routing_service/NginxReloader.ts
import { execa } from 'execa';
import { Logs } from '../../Utils/functions.js';
import { NGINX_SERVICE_NAME_IN_SWARM } from './utils.js'; // Nom du service Nginx

// Pour le debounce/requiredCall
// On peut utiliser une librairie simple ou un helper custom.
// Pour l'instant, une implémentation basique pour illustrer.
let reloadTimeout: NodeJS.Timeout | null = null;
const RELOAD_DEBOUNCE_MS = 5000; // Attendre 5 secondes d'inactivité avant de recharger

export class NginxReloader {
    private nginxServiceTarget: string; // Nom du service Nginx ou ID d'un conteneur spécifique

    constructor(
        private logs: Logs,
        nginxServiceInSwarm: string = NGINX_SERVICE_NAME_IN_SWARM
    ) {
        this.nginxServiceTarget = nginxServiceInSwarm;
        this.logs.log(`[NginxReloader] Initialisé pour cibler le service Swarm/conteneur Nginx: ${this.nginxServiceTarget}`);
    }

    private async isDockerAvailable(): Promise<boolean> {
        try {
            await execa('docker', ['version']);
            return true;
        } catch {
            this.logs.logErrors("❌ Docker CLI non disponible dans le conteneur.");
            return false;
        }
    }

    async getNginxContainerName(serviceName: string): Promise<string | null> {
        try {
            const { stdout } = await execa('docker', [
                'ps',
                '--filter',
                `name=${serviceName}`,
                '--format',
                '{{.Names}}',
            ])
            return stdout.split('\n')[0] || null
        } catch (error) {
            return null
        }
    }
    /**
     * Exécute une commande Docker exec sur le service Nginx.
     * Nécessite que s_server ait accès au socket Docker et les permissions.
     */
    private async runDockerNginxCommand(nginxCommandArgs: string[]): Promise<{ success: boolean; stdout?: string; stderr?: string }> {
        try {
            // Si nginxServiceTarget est un nom de service Swarm, `docker exec` ciblera une des tâches.
            // Pour nginx -s reload, cela fonctionne car le signal est envoyé au master process
            // qui gère les workers.
            // Pour nginx -t, cela teste la configuration sur la tâche ciblée, ce qui est généralement suffisant.
            console.log('>>>>>>>>>>>>>>>>>>> isDockerAvailable = ', await this.isDockerAvailable());

            const { stdout, stderr, failed, timedOut, isCanceled } = await execa(
                'docker', // Utiliser 'sudo', 'docker' si s_server ne tourne pas en root et n'est pas dans le groupe docker
                ['exec', await this.getNginxContainerName(this.nginxServiceTarget)||'', 'nginx', ...nginxCommandArgs],
                { timeout: 10000 } // Timeout de 10s
            );

            if (failed || timedOut || isCanceled) {
                this.logs.logErrors(`❌ Échec exécution commande Nginx : ${nginxCommandArgs.join(' ')}`, { stdout, stderr, failed, timedOut, isCanceled });
                return { success: false, stdout, stderr };
            }
            return { success: true, stdout, stderr };
        } catch (error: any) { // execa rejette en cas de code de sortie non nul
            this.logs.notifyErrors(`❌ Erreur critique exécution commande Nginx : ${nginxCommandArgs.join(' ')}`, { stdout: error.stdout, stderr: error.stderr }, error);
            return { success: false, stdout: error.stdout, stderr: error.stderr };
        }
    }

    /**
     * Teste la configuration Nginx.
     * @returns boolean Succès du test.
     */
    async testNginxConfig(): Promise<boolean> {
        this.logs.log(`🧪 Test de la configuration Nginx (via service ${this.nginxServiceTarget})...`);
        const result = await this.runDockerNginxCommand(['-t']);

        if (result.success) {
            // `nginx -t` écrit les messages de succès sur stderr aussi, c'est normal.
            this.logs.log(`✅ Configuration Nginx valide. Output:\n${result.stderr || result.stdout}`);
            return true;
        } else {
            this.logs.logErrors(`❌ Configuration Nginx invalide. Output:\n${result.stderr || result.stdout}`);
            return false;
        }
    }

    /**
     * Recharge la configuration Nginx.
     * @returns boolean Succès du rechargement.
     */
    async reloadNginxService(): Promise<boolean> {
        this.logs.log(`🚀 Rechargement de Nginx (via service ${this.nginxServiceTarget})...`);
        // D'abord, tester la configuration avant de recharger
        if (!await this.testNginxConfig()) {
            this.logs.logErrors("❌ Rechargement annulé car la configuration Nginx est invalide.");
            return false;
        }

        const result = await this.runDockerNginxCommand(['-s', 'reload']);
        if (result.success) {
            this.logs.log(`✅ Nginx rechargé avec succès.`);
            return true;
        } else {
            this.logs.logErrors(`❌ Échec du rechargement de Nginx. Output:\n${result.stderr || result.stdout}`);
            return false;
        }
    }

    /**
     * Déclenche un rechargement Nginx (débouncé).
     * Si un rechargement est déjà en attente, il est annulé et un nouveau est programmé.
     */
    async triggerNginxReloadDebounced(): Promise<void> {
        this.logs.log(`🕒 Demande de rechargement Nginx (débouncé - ${RELOAD_DEBOUNCE_MS}ms)...`);
        if (reloadTimeout) {
            clearTimeout(reloadTimeout);
            this.logs.log(`   -> Rechargement précédent annulé.`);
        }

        reloadTimeout = setTimeout(async () => {
            this.logs.log(`⚡ Exécution du rechargement Nginx débouncé.`);
            await this.reloadNginxService();
            reloadTimeout = null;
        }, RELOAD_DEBOUNCE_MS);
    }
}