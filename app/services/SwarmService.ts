// app/services/SwarmService.ts
import Dockerode, { type ServiceSpec, type Service, type Task } from 'dockerode'
import { Logs } from '../Utils/functions.js'
import env from '#start/env';



const networkName = env.get('DOCKER_SWARM_NETWORK_NAME', 'sublymus_net');
export const defaultNetworks = [{ Target: networkName }];

export type ServiceUpdateOptions = ServiceSpec & {
    version: number
}
// Initialisation de Dockerode (va essayer /var/run/docker.sock par défaut)
const docker = new Dockerode()




class SwarmService {
    public docker = docker;
    /**
     * Crée ou met à jour un service Docker Swarm.
     * S'il existe déjà, il sera mis à jour avec la nouvelle définition.
     *
     * @param name Nom unique du service (ex: 'api_store_<store_uuid>')
     * @param spec Définition complète du service (image, ports, env, volumes, replicas, etc.)
     * @returns L'objet Service créé ou mis à jour, ou null en cas d'erreur.
     */
    async createOrUpdateService(name: string, spec: ServiceSpec): Promise<Service | null> {
        const logs = new Logs(`SwarmService.createOrUpdateService (${name})`)
        try {
            // Vérifie si le service existe déjà
            const existingService = docker.getService(name)
            try {
                await existingService.inspect()
                // Le service existe, on le met à jour
                logs.log(`🔧 Service existant trouvé, mise à jour...`)

                // Pour mettre à jour un service, il faut fournir sa version actuelle
                const serviceInfo = await existingService.inspect()
                const version = serviceInfo.Version.Index

                spec.TaskTemplate = spec.TaskTemplate ?? {}
                spec.TaskTemplate.Networks = spec.TaskTemplate.Networks ?? defaultNetworks

                // Note: La spec fournie doit être la nouvelle définition complète
                await existingService.update({
                    ...serviceInfo.Spec,
                    version,
                    TaskTemplate: {
                        ...serviceInfo.Spec.TaskTemplate,
                        ContainerSpec: {
                            ...serviceInfo.Spec.TaskTemplate.ContainerSpec,
                        }
                    },
                    TaskTemplateForceUpdate: (serviceInfo.Spec.TaskTemplate?.ForceUpdate || 0) + 1
                });
                logs.log(`✅ Service mis à jour avec succès.`)
                return existingService
            } catch (error: any) {
                if (error.statusCode === 404) {
                    // Le service n'existe pas, on le crée
                    logs.log(`✨ Service non trouvé, création...`)
                    spec.Name = name // Assure-toi que le nom est dans la spec
                    const newService = await docker.createService(spec)
                    console.log(spec);

                    logs.log(`✅ Service créé avec succès. ID: ${newService.id}`)
                    // Retourne l'objet Service fraîchement créé pour d'éventuelles inspections
                    return docker.getService(newService.id)
                }
                // Autre erreur lors de l'inspection
                throw error
            }
        } catch (error: any) {
            logs.notifyErrors(`❌ Erreur lors de la création/mise à jour du service Swarm:`, { name, spec }, error)
            return null
        }
    }

    /**
     * Supprime un service Docker Swarm.
     *
     * @param name Nom unique du service à supprimer.
     * @returns boolean Indiquant si la suppression a réussi.
     */
    async removeService(name: string): Promise<boolean> {
        const logs = new Logs(`SwarmService.removeService (${name})`)
        try {
            const service = docker.getService(name)
            await service.inspect() // Vérifie qu'il existe avant de tenter de supprimer
            await service.remove()
            logs.log(`✅ Service supprimé avec succès.`)
            return true
        } catch (error: any) {
            if (error.statusCode === 404) {
                logs.log(`ℹ️ Service déjà supprimé ou inexistant.`)
                return true // Considéré comme un succès si l'objectif est qu'il n'existe plus
            }
            logs.notifyErrors(`❌ Erreur lors de la suppression du service Swarm:`, { name }, error)
            return false
        }
    }

    /**
     * Met à l'échelle un service Swarm (change le nombre de répliques).
     *
     * @param name Nom unique du service.
     * @param replicas Nombre désiré de répliques.
     * @returns boolean Indiquant si la mise à l'échelle a réussi.
     */
    async scaleService(name: string, replicas: number): Promise<boolean> {
        const logs = new Logs(`SwarmService.scaleService (${name})`)
        try {
            const service = docker.getService(name)
            console.log(service.Spec?.TaskTemplate);

            const serviceInfo = await service.inspect() // Récupère TOUTE la conf actuelle
            const version = serviceInfo.Version.Index
            console.log(serviceInfo.TaskTemplate);
            // *** IMPORTANT : Ne pas recréer la spec de zéro ici ! ***
            // Copie la spec existante et ne modifie QUE la partie Replicas
            const updateSpec = { ...serviceInfo.Spec }; // Copie profonde serait mieux mais complexe avec Dockerode

            // Assure que la structure existe
            if (!updateSpec.Mode) updateSpec.Mode = {};
            if (!updateSpec.Mode.Replicated) updateSpec.Mode.Replicated = { Replicas: replicas };
            if (!updateSpec.TaskTemplate) updateSpec.TaskTemplate = {};
            if (!updateSpec.TaskTemplate?.Networks) updateSpec.TaskTemplate.Networks = defaultNetworks
            // Modifie SEULEMENT les replicas
            updateSpec.Mode.Replicated.Replicas = replicas;

            // Envoie la mise à jour avec la version ET la spec modifiée MINIMALEMENT
            await service.update({ version, ...updateSpec });

            logs.log(`✅ Service mis à l'échelle à ${replicas} répliques.`);
            return true
        } catch (error: any) {
            logs.notifyErrors(`❌ Erreur lors de la mise à l'échelle du service Swarm:`, { name, replicas }, error)
            return false
        }
    }

    /**
     * Inspecte un service Swarm pour obtenir des détails.
     *
     * @param name Nom unique du service.
     * @returns L'information détaillée du service ou null en cas d'erreur.
     */
    async inspectService(name: string): Promise<Awaited<ReturnType<Dockerode.Service['inspect']>>> {
        const logs = new Logs(`SwarmService.inspectService (${name})`)
        try {
            const service = docker.getService(name)
            const info = await service.inspect()
            return info
        } catch (error: any) {
            if (error.statusCode !== 404) { // Ignore l'erreur "not found" ici
                logs.notifyErrors(`❌ Erreur lors de l'inspection du service Swarm:`, { name }, error)
            }
            return null
        }
    }

    /**
     * Liste les tâches (conteneurs) actives pour un service donné.
     * Utile pour connaître les IP/ports des instances.
     *
     * @param serviceName Nom unique du service.
     * @returns Liste des tâches avec leur statut et informations réseau, ou tableau vide.
     */
    async listServiceTasks(serviceName: string): Promise<Task[]> {
        const logs = new Logs(`SwarmService.listServiceTasks (${serviceName})`)
        try {
            const tasks = await docker.listTasks({
                filters: `{"service": ["${serviceName}"], "desired-state": ["running"]}` // Filtre pour les tâches actives du service
            });
            return tasks;
        } catch (error: any) {
            logs.notifyErrors(`❌ Erreur lors de la récupération des tâches pour le service ${serviceName}:`, {}, error);
            return [];
        }
    }

    /**
    * Méthode d'aide pour construire la spécification d'un service API.
    * Prend en entrée les paramètres spécifiques à l'API et retourne l'objet ServiceSpec.
    * À adapter/compléter avec toutes les options nécessaires (variables d'env, réseaux, etc.)
    */
    constructApiServiceSpec(
        {
            storeId,
            imageName,
            replicas,
            internalPort,
            envVars,
            volumeSource,
            volumeTarget,
            userNameOrId,
            resources = 'basic',
        }: {
            storeId: string,
            imageName: string, // Ex: 'sublymus_api:latest'
            replicas: number,
            internalPort: number,
            envVars: Record<string, number | string | undefined>, // Variables d'environnement
            volumeSource: string, // Chemin sur l'hôte
            volumeTarget: string, // Chemin dans le conteneur
            userNameOrId: string, // Nom ou ID de l'utilisateur système
            resources: SubscriptionTier
        }
        // Ajouter d'autres paramètres si nécessaire: réseau, limites ressources, etc.
    ): ServiceSpec {
        const serviceName = `api_store_${storeId}`;
        console.log({
            volumeSource,
            volumeTarget,
            userNameOrId,
            resources,
        });


        return {
            Name: serviceName,
            TaskTemplate: {
                ContainerSpec: {
                    Image: imageName,
                    Env: Object.entries(envVars)
                        .filter(([_, value]) => value !== undefined)
                        .map(([key, value]) => `${key}=${value}`),
                    User: userNameOrId, // Exécuter en tant qu'utilisateur spécifique
                    Mounts: [
                        {
                            Type: 'bind', // Type de montage 'bind' pour lier un dossier hôte
                            Source: volumeSource, // Chemin sur l'hôte
                            Target: volumeTarget, // Chemin dans le conteneur
                        },
                        {
                            Type: 'bind',
                            Source:'/srv/sublymus/volumes/s_server_keys',
                            Target: '/secret_keys'
                        }
                        // Ajouter d'autres volumes si nécessaire
                    ],
                },
                Resources: getResourcesByTier(resources), //TODO pour le moment seul l'offre basic marche, il faudre monitorer en production pour ajuter les les resources  
                RestartPolicy: { /* ... */ },
            },
            Mode: {
                Replicated: {
                    Replicas: replicas,
                },
            },
            UpdateConfig: { // Configuration des mises à jour (rolling updates)
                Parallelism: 1, // Mettre à jour 1 conteneur à la fois
                Delay: 10 * 1000000000, // Attendre 10s entre chaque mise à jour
                FailureAction: 'pause', // Pause la màj en cas d'échec
                Order: 'start-first', // Démarre le nouveau avant d'arrêter l'ancien
            },
            Networks: defaultNetworks,
            EndpointSpec: { // Définition des ports
                // Swarm gère le port interne. Nginx appellera le nom du service.
                // Les ports publiés (Ports) sont moins courants ici si Nginx est le seul point d'entrée.
                Ports: [
                    {
                        Protocol: 'tcp',
                        TargetPort: internalPort     // Le port dans le conteneur
                        //PublishedPort: externalPort, // Le port sur l'hôte (si nécessaire, géré par Swarm)
                    }
                ]
            },
            Labels: {
                'sublymus.service.type': 'api',
                'sublymus.service.target': 'store',
                'sublymus.store.id': storeId,
            }
        };

    }
    constructThemeServiceSpec(
        {
            themeId,
            imageName,
            replicas,
            internalPort,
            envVars,
            resources = 'high',
        }: {
            themeId: string,
            imageName: string,
            replicas: number,
            internalPort: number,
            envVars: Record<string, string | undefined>,
            resources: SubscriptionTier
        }
    ): ServiceSpec {
        const serviceName = `theme_${themeId}`;

        return {
            Name: serviceName,
            TaskTemplate: {
                ContainerSpec: {
                    Image: imageName,
                    Env: Object.entries(envVars)
                        .filter(([_, value]) => value !== undefined)
                        .map(([key, value]) => `${key}=${value}`),
                    // User: '...', // Optionnel si nécessaire
                    // Mounts: [], // Optionnel si nécessaire
                },
                Resources: getResourcesByTier(resources),
                RestartPolicy: { /* ... */ },
            },
            Mode: {
                Replicated: {
                    Replicas: replicas,
                },
            },
            UpdateConfig: { // Configuration des mises à jour (rolling updates)
                Parallelism: 1, // Mettre à jour 1 conteneur à la fois
                Delay: 10 * 1000000000, // Attendre 10s entre chaque mise à jour
                FailureAction: 'pause', // Pause la màj en cas d'échec
                Order: 'start-first', // Démarre le nouveau avant d'arrêter l'ancien
            },
            Networks: defaultNetworks,
            EndpointSpec: { // Définition des ports
                // Swarm gère le port interne. Nginx appellera le nom du service.
                // Les ports publiés (Ports) sont moins courants ici si Nginx est le seul point d'entrée.
                Ports: [
                    {
                        Protocol: 'tcp',
                        TargetPort: internalPort     // Le port dans le conteneur
                        //PublishedPort: externalPort, // Le port sur l'hôte (si nécessaire, géré par Swarm)
                    }
                ]
            },
            Labels: {
                'sublymus.service.type': 'theme',
                'sublymus.theme.id': themeId,
            }
        };
    }
    constructGenericAppServiceSpec({
            serviceName,
            imageName,
            replicas,
            internalPort,
            envVars,
            resources = 'high',
        }: {
            serviceName: string,
            imageName: string,
            replicas: number,
            internalPort: number,
            envVars: Record<string, string | undefined>,
            resources: SubscriptionTier
        }
    ): ServiceSpec {

        return {
            Name: serviceName,
            TaskTemplate: {
                ContainerSpec: {
                    Image: imageName,
                    Env: Object.entries(envVars)
                        .filter(([_, value]) => value !== undefined)
                        .map(([key, value]) => `${key}=${value}`),
                    // User: '...', // Optionnel si nécessaire
                    // Mounts: [], // Optionnel si nécessaire
                },
                Resources: getResourcesByTier(resources),
                RestartPolicy: { /* ... */ },
            },
            Mode: {
                Replicated: {
                    Replicas: replicas,
                },
            },
            UpdateConfig: { // Configuration des mises à jour (rolling updates)
                Parallelism: 1, // Mettre à jour 1 conteneur à la fois
                Delay: 10 * 1000000000, // Attendre 10s entre chaque mise à jour
                FailureAction: 'pause', // Pause la màj en cas d'échec
                Order: 'start-first', // Démarre le nouveau avant d'arrêter l'ancien
            },
            Networks: defaultNetworks,
            EndpointSpec: { // Définition des ports
                // Swarm gère le port interne. Nginx appellera le nom du service.
                // Les ports publiés (Ports) sont moins courants ici si Nginx est le seul point d'entrée.
                Ports: [
                    {
                        Protocol: 'tcp',
                        TargetPort: internalPort     // Le port dans le conteneur
                        //PublishedPort: externalPort, // Le port sur l'hôte (si nécessaire, géré par Swarm)
                    }
                ]
            },
            Labels: {
                'sublymus.service.type': 'app',
                'sublymus.app.id': serviceName,
            }
        };
    }
    async forceServiceUpdate(name: string): Promise<boolean> {
        const logs = new Logs(`SwarmService.forceServiceUpdate (${name})`);
        try {
            const service = this.docker.getService(name);
            await service.inspect(); // Vérifie l'existence
            // L'option --force dans la CLI docker service update est un raccourci.
            // Pour l'API Docker, on incrémente TaskTemplateForceUpdate
            // ou on change un label anodin pour forcer la mise à jour.
            // La méthode la plus simple est de faire un update avec l'image actuelle, Swarm devrait redéployer.
            const serviceInfo = await service.inspect();
            const version = serviceInfo.Version.Index;
            await service.update({
                version,
                ...serviceInfo.Spec, // Réutiliser la spec actuelle
                // Pour réellement forcer un redéploiement des tâches si rien n'a changé dans la spec:
                TaskTemplate: {
                    ...serviceInfo.Spec.TaskTemplate,
                    ForceUpdate: (serviceInfo.Spec.TaskTemplate?.ForceUpdate || 0) + 1,
                }
            });
            logs.log(`✅ Mise à jour forcée demandée pour le service ${name}.`);
            return true;
        } catch (error: any) {
            if (error.statusCode === 404) {
                logs.logErrors(`❌ Service ${name} non trouvé pour forceUpdate.`);
            } else {
                logs.notifyErrors(`❌ Erreur lors de la mise à jour forcée du service Swarm ${name}:`, {}, error);
            }
            return false;
        }
    }
}

// Exporte une instance unique (Singleton)
export default new SwarmService()

export type SubscriptionTier = 'basic' | 'medium' | 'high';

const resourcePresets: Record<SubscriptionTier, {
    limits: {
        MemoryBytes: number;
        NanoCPUs: number;
    };
    reservations: {
        MemoryBytes: number;
        NanoCPUs: number;
    };
}> = {
    basic: {
        limits: {
            MemoryBytes: 256 * 1024 * 1024, // 256 MB
            NanoCPUs: 250_000_000,          // 0.25 CPU
        },
        reservations: {
            MemoryBytes: 64 * 1024 * 1024,  // 64 MB
            NanoCPUs: 50_000_000,           // 0.05 CPU
        }
    },
    medium: {
        limits: {
            MemoryBytes: 512 * 1024 * 1024, // 512 MB
            NanoCPUs: 500_000_000,          // 0.5 CPU
        },
        reservations: {
            MemoryBytes: 128 * 1024 * 1024, // 128 MB
            NanoCPUs: 100_000_000,          // 0.1 CPU
        }
    },
    high: {
        limits: {
            MemoryBytes: 1024 * 1024 * 1024, // 1 GB
            NanoCPUs: 1_000_000_000,         // 1 CPU
        },
        reservations: {
            MemoryBytes: 256 * 1024 * 1024,  // 256 MB
            NanoCPUs: 250_000_000,           // 0.25 CPU
        }
    }
};

function getResourcesByTier(tier: SubscriptionTier) {
    const preset = resourcePresets[tier];
    return {
        Limits: preset.limits,
        Reservations: preset.reservations
    };
}