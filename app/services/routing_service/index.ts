// s_server/app/services/routing_service/index.ts
import { RoutingServiceClass } from './RoutingService.js';
import { NginxConfigGenerator } from './NginxConfigGenerator.js';
import { NginxFileManager } from './NginxFileManager.js';
import { NginxReloader } from './NginxReloader.js';
import { Logs } from '../../Utils/functions.js'; // Adapte
import { NGINX_SERVICE_NAME_IN_SWARM } from './utils.js';

// Créer une instance de Logs globale ou spécifique pour le service de routage
const routingServiceLogs = new Logs('RoutingServiceMain');

const nginxConfigGeneratorInstance = new NginxConfigGenerator();
const nginxFileManagerInstance = new NginxFileManager(routingServiceLogs.fork('FileManager')); // Passe un log forké
const nginxReloaderInstance = new NginxReloader(routingServiceLogs.fork('Reloader'), NGINX_SERVICE_NAME_IN_SWARM);

const routingServiceInstance = new RoutingServiceClass(
    nginxConfigGeneratorInstance,
    nginxFileManagerInstance,
    nginxReloaderInstance,
    routingServiceLogs // Passe le log principal au service de routage
);

export default routingServiceInstance;