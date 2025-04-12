// app/services/SwarmService.ts
import Dockerode, { type ServiceSpec, type Service, type Task, NetworkAttachmentConfig } from 'dockerode'
import { Logs } from '../controllers2/Utils/functions.js'


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

                // Note: La spec fournie doit être la nouvelle définition complète
                await existingService.update({ version, ...spec } as ServiceUpdateOptions) // Cast nécessaire car les types dockerode sont parfois stricts
                logs.log(`✅ Service mis à jour avec succès.`)
                return existingService
            } catch (error: any) {
                if (error.statusCode === 404) {
                    // Le service n'existe pas, on le crée
                    logs.log(`✨ Service non trouvé, création...`)
                    spec.Name = name // Assure-toi que le nom est dans la spec
                    const newService = await docker.createService(spec)
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
            const serviceInfo = await service.inspect()
            const version = serviceInfo.Version.Index

            // Crée une spec partielle pour la mise à jour, changeant uniquement le mode et les répliques
            const updateSpec: ServiceUpdateOptions = {
                version,
                Mode: {
                    Replicated: {
                        Replicas: replicas,
                    },
                },
                // Il faut aussi inclure d'autres éléments essentiels de la spec sinon ils sont réinitialisés !
                // C'est une limitation/particularité de l'API Docker. Il faut reprendre la spec existante.
                Name: serviceInfo.Spec.Name,
                TaskTemplate: serviceInfo.Spec.TaskTemplate,
                EndpointSpec: serviceInfo.Spec.EndpointSpec,
                Labels: serviceInfo.Spec.Labels,
                UpdateConfig: serviceInfo.Spec.UpdateConfig, // Important pour rolling updates
                RollbackConfig: serviceInfo.Spec.RollbackConfig,
            }

            // Assure que le Mode existe dans la spec avant de tenter de mettre replicas
            if (!updateSpec.Mode) {
                updateSpec.Mode = {}
            }
            if (!updateSpec.Mode.Replicated) {
                updateSpec.Mode.Replicated = {}
            }
            updateSpec.Mode.Replicated.Replicas = replicas

            await service.update(updateSpec)

            logs.log(`✅ Service mis à l'échelle à ${replicas} répliques.`)
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
            networks,
            resources = 'basic',
        }: {
            storeId: string,
            imageName: string, // Ex: 'sublymus_api:latest'
            replicas: number,
            internalPort: number,
            envVars: Record<string, number|string | undefined>, // Variables d'environnement
            volumeSource: string, // Chemin sur l'hôte
            volumeTarget: string, // Chemin dans le conteneur
            userNameOrId: string, // Nom ou ID de l'utilisateur système
            networks?: NetworkAttachmentConfig[],
            resources: SubscriptionTier
        }
        // Ajouter d'autres paramètres si nécessaire: réseau, limites ressources, etc.
    ): ServiceSpec {
        const serviceName = `api_store_${storeId}`

        return {
            Name: serviceName, // Nom du service
            TaskTemplate: {
                ContainerSpec: {
                    Image: imageName, // Image Docker à utiliser
                    Env: Object.entries(envVars)
                        .filter(([_, value]) => value !== undefined) // Filtre les clés avec valeur undefined
                        .map(([key, value]) => `${key}=${value}`), // Format ENV VAR
                    User: userNameOrId, // Exécuter en tant qu'utilisateur spécifique
                    Mounts: [
                        {
                            Type: 'bind', // Type de montage 'bind' pour lier un dossier hôte
                            Source: volumeSource, // Chemin sur l'hôte
                            Target: volumeTarget, // Chemin dans le conteneur
                        },
                        // Ajouter d'autres volumes si nécessaire
                    ],
                    // HealthCheck: { // Exemple de HealthCheck (optionnel mais recommandé)
                    //   Test: ["CMD-SHELL", "curl --fail http://localhost:${internalPort}/health || exit 1"],
                    //   Interval: 10 * 1000000000, // 10s
                    //   Timeout: 5 * 1000000000, // 5s
                    //   Retries: 3
                    // }
                },
                Resources: getResourcesByTier(resources),
                RestartPolicy: { // Politique de redémarrage en cas d'échec
                    Condition: 'on-failure',
                    Delay: 5 * 1000000000, // 5s
                    MaxAttempts: 3,
                },
                Placement: { // Contraintes de placement (si tu as plusieurs nœuds Swarm)
                    // Constraints: ['node.role == worker']
                },
                Networks: networks // [{ Target: 'my-overlay-network' }] // Nom du réseau overlay si nécessaire
            },
            Mode: {
                Replicated: {
                    Replicas: replicas, // Nombre d'instances
                },
            },
            UpdateConfig: { // Configuration des mises à jour (rolling updates)
                Parallelism: 1, // Mettre à jour 1 conteneur à la fois
                Delay: 10 * 1000000000, // Attendre 10s entre chaque mise à jour
                FailureAction: 'pause', // Pause la màj en cas d'échec
                Order: 'start-first', // Démarre le nouveau avant d'arrêter l'ancien
            },
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
            Labels: { // Étiquettes pour l'organisation/filtrage
                'sublymus.service.type': 'api',
                'sublymus.store.id': storeId,
                // ...autres labels
            }
        }
    }
    constructThemeServiceSpec(
       {
        themeId,
        imageName,
        replicas,
        internalPort,
        envVars,
        networks,
        resources='high',
       }:{
        themeId: string,
        imageName: string,
        replicas: number,
        internalPort: number,
        envVars: Record<string, string | undefined>,
        networks?: NetworkAttachmentConfig[],
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
            Networks: networks,
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