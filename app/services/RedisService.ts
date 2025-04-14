// app/services/RedisService.ts

import { Logs } from '../controllers2/Utils/functions.js'
import Store from '#models/store'
import { HOST_PORT } from '../controllers2/Utils/Interfaces.js'
import Redis, { type Redis as RedisClient } from 'ioredis'
import { Queue, Worker } from 'bullmq'
import { EventEmitter } from 'node:events'
import env from '#start/env'

class RedisService {
  private client: RedisClient;
//   private subscriber: RedisClient | null = null; // Client dédié pour Pub/Sub si besoin
//   private publisher: RedisClient | null = null;  // Client dédié pour Pub/Sub si besoin
  private queues: Map<string, Queue> = new Map(); // Pour les queues BullMQ
  private workers: Map<string, Worker> = new Map(); // Pour les workers BullMQ
  public emitter: EventEmitter = new EventEmitter(); // EventEmitter pour les messages reçus par workers

  constructor() {
    //@ts-ignore
    this.client = new Redis({
      host: env.get('REDIS_HOST', '127.0.0.1'),
      port: env.get('REDIS_PORT', '6379'),
      password: env.get('REDIS_PASSWORD'),
      // lazyConnect: true, // Optionnel: connecter seulement quand nécessaire
      maxRetriesPerRequest: 3, // Nombre max de tentatives si connexion échoue
      enableReadyCheck: true, // Vérifie si Redis est prêt avant d'envoyer des commandes
    });

    this.setupEventHandlers();

    // Initialiser Pub/Sub clients si nécessaire pour une autre logique (non BullMQ)
    // this.publisher = this.client.duplicate();
    // this.subscriber = this.client.duplicate();
    // this.subscriber.subscribe('channel_name', (err, count) => { /* ... */ });
    // this.subscriber.on('message', (channel, message) => { /* ... */ });
  }

  private setupEventHandlers(): void {
    this.client.on('connect', () => {
      console.log('🔌 Connecté à Redis.');
    });
    this.client.on('ready', () => {
      console.log('✅ Redis prêt.');
    });
    this.client.on('error', (error) => {
      console.error('❌ Erreur de connexion Redis:', error);
      // Gérer les erreurs de connexion persistantes (arrêter l'app? mode dégradé?)
    });
    this.client.on('reconnecting', () => {
      console.log('⏳ Tentative de reconnexion à Redis...');
    });
    this.client.on('close', () => {
        console.log('🚪 Connexion Redis fermée.');
    });
    this.client.on('end', () => {
        console.log('🏁 Connexion Redis terminée définitivement.');
        // Gérer l'arrêt définitif (arrêter l'app?)
    });
  }

  // --- Fonctions Cache ---

  /**
   * Met une valeur en cache. Sérialise automatiquement en JSON.
   * @param key La clé de cache.
   * @param value La valeur à mettre en cache (peut être un objet/tableau).
   * @param ttlSecondes Temps de vie en secondes (optionnel).
   */
  async setCache(key: string, value: any, ttlSecondes?: number): Promise<boolean> {
    const logs = new Logs(`RedisService.setCache (${key})`);
    try {
      const stringValue = JSON.stringify(value);
      if (ttlSecondes) {
        await this.client.set(key, stringValue, 'EX', ttlSecondes);
      } else {
        await this.client.set(key, stringValue);
      }
      // logs.log(`💾 Cache défini.`); // Peut être trop verbeux
      return true;
    } catch (error) {
      logs.notifyErrors('❌ Erreur setCache Redis', { key }, error);
      return false;
    }
  }

  /**
   * Récupère une valeur du cache. Désérialise automatiquement depuis JSON.
   * @param key La clé de cache.
   * @returns La valeur désérialisée, ou null si non trouvé ou erreur.
   */
  async getCache<T = any>(key: string): Promise<T | null> {
    const logs = new Logs(`RedisService.getCache (${key})`);
    try {
      const stringValue = await this.client.get(key);
      if (!stringValue) {
        return null;
      }
      return JSON.parse(stringValue) as T;
    } catch (error) {
       // Peut être une erreur JSON.parse ou une erreur Redis
      if (error instanceof SyntaxError) {
         logs.logErrors(`⚠️ Valeur non JSON dans le cache pour la clé`, {key}, error);
      } else {
          logs.notifyErrors('❌ Erreur getCache Redis', { key }, error);
      }
      return null;
    }
  }

  /**
   * Supprime une ou plusieurs clés du cache.
   * @param keys La ou les clés à supprimer.
   * @returns Le nombre de clés supprimées.
   */
  async deleteCache(...keys: string[]): Promise<number> {
    const logs = new Logs(`RedisService.deleteCache (${keys.join(', ')})`);
    if (keys.length === 0) return 0;
    try {
      const count = await this.client.del(keys);
      // logs.log(`🗑️ Cache supprimé(s) : ${count}.`);
      return count;
    } catch (error) {
      logs.notifyErrors('❌ Erreur deleteCache Redis', { keys }, error);
      return 0;
    }
  }

  // --- Fonctions Cache Spécifiques Store ---

  /**
   * Met en cache les informations d'un store sous son ID et son nom.
   * @param store L'objet Store.
   * @param previousName Nom précédent pour nettoyer l'ancien cache nom->id.
   * @param ttlSecondes Optionnel: durée de vie du cache.
   */
  async setStoreCache(store: Store, previousName?: string, ttlSecondes?: number): Promise<void> {
      if (previousName && previousName !== store.name) {
          await this.deleteCache(this.getStoreNameKey(previousName));
      }
      const storeIdKey = this.getStoreIdKey(store.id);
      const storeNameKey = this.getStoreNameKey(store.name);

      // Transaction Redis pour assurer l'atomicité (ou au moins regrouper les appels)
      const multi = this.client.multi();
      const storeData = store.$attributes; // Ne stocker que les données sérialisables

      multi.set(storeIdKey, JSON.stringify(storeData));
      multi.set(storeNameKey, store.id); // Clé nom -> ID

      if (ttlSecondes) {
          multi.expire(storeIdKey, ttlSecondes);
          multi.expire(storeNameKey, ttlSecondes);
      }

      try {
          await multi.exec();
      } catch (error) {
          new Logs('RedisService.setStoreCache').notifyErrors('❌ Erreur transaction Redis', {storeId: store.id}, error);
      }
  }

  async getStoreCacheById(storeId: string): Promise<Store['$attributes'] | null> {
      return this.getCache<Store['$attributes']>(this.getStoreIdKey(storeId));
  }

  async getStoreCacheByName(storeName: string): Promise<Store['$attributes'] | null> {
      const storeId = await this.getCache<string>(this.getStoreNameKey(storeName));
      if (!storeId) return null;
      return this.getStoreCacheById(storeId);
  }

  async deleteStoreCache(store: Store): Promise<void> {
      await this.deleteCache(
          this.getStoreIdKey(store.id),
          this.getStoreNameKey(store.name)
          // Il faudrait aussi supprimer les host ports associés ?
          // this.getStoreHostPortKey(store.id) // Appel à une autre méthode de suppression ?
      );
       // Supprimer aussi les host ports associés
      await this.deleteStoreApiHostPorts(store.id);
  }

   // Méthodes pour obtenir les clés de cache standardisées
   private getStoreIdKey(storeId: string): string { return `store+id+${storeId}`; }
   private getStoreNameKey(storeName: string): string { return `store+name:+${storeName}`; }
   private getStoreHostPortKey(storeId: string): string { return `store+hp+${storeId}`; }


  // --- Fonctions Cache Spécifiques Host/Port API ---

  async setStoreApiHostPorts(storeId: string, hostPorts: HOST_PORT[], ttlSecondes?: number): Promise<void> {
      await this.setCache(this.getStoreHostPortKey(storeId), hostPorts, ttlSecondes);
  }

  async getStoreApiHostPorts(storeId: string): Promise<HOST_PORT[]> {
      return (await this.getCache<HOST_PORT[]>(this.getStoreHostPortKey(storeId))) ?? [];
  }

   // Met à jour les HostPorts via une fonction de callback pour éviter les race conditions
  async updateStoreApiHostPorts(storeId: string, updater: (currentHostPorts: HOST_PORT[]) => HOST_PORT[], ttlSecondes?: number): Promise<void> {
        // Attention: Ce n'est pas atomique sans WATCH/MULTI/EXEC.
        // Pour une application simple, ça peut suffire.
        // Pour une forte concurrence, implémenter un lock ou utiliser WATCH.
        const currentHostPorts = await this.getStoreApiHostPorts(storeId);
        const newHostPorts = updater(currentHostPorts);
        await this.setStoreApiHostPorts(storeId, newHostPorts, ttlSecondes);
  }


  async deleteStoreApiHostPorts(storeId: string): Promise<void> {
      await this.deleteCache(this.getStoreHostPortKey(storeId));
  }


  // --- Fonctions de Communication (remplace RedisBidirectional) ---

  /**
   * Assure qu'une queue et un worker BullMQ existent pour un service (basé sur BASE_ID).
   * Crée le canal s'il n'existe pas. Conçu pour être appelé sans risque plusieurs fois.
   *
   * @param baseId Identifiant unique du canal de communication (ex: storeId, themeId).
   */
  async ensureCommunicationChannel(baseId: string): Promise<void> {
      const logs = new Logs(`RedisService.ensureCommunicationChannel (${baseId})`);
      if (this.workers.has(baseId) && this.queues.has(baseId)) {
          // logs.log('ℹ️ Canal de communication déjà initialisé.');
          return; // Déjà initialisé
      }

      const queueName = `server-to-service+${baseId}`; // Queue pour envoyer des messages AU service
      const workerName = `service-to-server+${baseId}`; // Queue pour recevoir des messages DU service

      try {
          // Crée la queue si elle n'existe pas
          if (!this.queues.has(baseId)) {
              const queue = new Queue(queueName, {
                  connection: this.client.duplicate(), // Utilise une connexion dédiée pour BullMQ
                   defaultJobOptions: { // Options par défaut pour les jobs
                       attempts: 3, // 3 essais en cas d'échec
                       backoff: { type: 'exponential', delay: 1000 }, // Backoff exponentiel
                       removeOnComplete: true, // Nettoie les jobs réussis
                       removeOnFail: 1000 // Garde les 1000 derniers jobs échoués
                   }
              });
              this.queues.set(baseId, queue);
              logs.log(`✅ Queue BullMQ '${queueName}' créée/attachée.`);
          }

          // Crée le worker s'il n'existe pas
          if (!this.workers.has(baseId)) {
              const worker = new Worker(
                  workerName,
                  async (job) => {
                      // Émettre un événement sur l'emitter local quand un message est reçu
                      const eventName = `${baseId}+${job.data.event || 'message'}`;
                      logs.log(`📬 Message reçu sur '${workerName}', event='${job.data.event}', emission='${eventName}'`);
                      this.emitter.emit(eventName, job.data.data); // Émet data.data
                      this.emitter.emit(baseId, job.data);       // Émet l'objet job.data complet
                  },
                  {
                      connection: this.client.duplicate(), // Connexion dédiée
                      concurrency: 5, // Traite jusqu'à 5 messages en parallèle
                  }
              );

              worker.on('failed', (job, err) => {
                  logs.logErrors(`❌ Job '${job?.id}' a échoué sur '${workerName}'`, { job }, err);
              });
              worker.on('error', err => {
                   logs.notifyErrors(`❌ Erreur Worker BullMQ '${workerName}'`, {}, err);
              });

              this.workers.set(baseId, worker);
              logs.log(`✅ Worker BullMQ '${workerName}' créé/attaché.`);
          }

      } catch (error) {
          logs.notifyErrors(`❌ Erreur lors de la création/attachement du canal de communication pour ${baseId}`, {}, error);
          // Nettoyer partiellement créé ?
          await this.closeCommunicationChannel(baseId); // Tenter de fermer en cas d'échec partiel
      }
  }

  /**
   * Envoie un message à un service via sa queue BullMQ.
   * Assure que le canal existe avant d'envoyer.
   *
   * @param baseId L'ID du service cible.
   * @param event Le type d'événement/message (ex: 'request_scale', 'config_update').
   * @param data Les données associées à l'événement.
   * @returns boolean Succès de l'ajout à la queue.
   */
  async sendMessageToService(baseId: string, event: string, data: any): Promise<boolean> {
      const logs = new Logs(`RedisService.sendMessageToService (${baseId})`);
      try {
          await this.ensureCommunicationChannel(baseId); // S'assure que la queue existe
          const queue = this.queues.get(baseId);
          if (!queue) {
             throw new Error(`Queue pour ${baseId} non trouvée après initialisation.`);
          }
          const jobName = event; // Utiliser l'événement comme nom de job pour le suivi
          await queue.add(jobName, { event, data });
          logs.log(`✅ Message '${event}' envoyé à la queue pour ${baseId}.`);
          return true;
      } catch (error) {
           logs.notifyErrors(`❌ Erreur lors de l'envoi du message '${event}' à ${baseId}`, { data }, error);
          return false;
      }
  }

   /**
   * Ferme proprement la queue et le worker BullMQ pour un service.
   * À appeler lors de la suppression définitive du service.
   *
   * @param baseId L'ID du canal à fermer.
   */
  async closeCommunicationChannel(baseId: string): Promise<void> {
    const logs = new Logs(`RedisService.closeCommunicationChannel (${baseId})`);
    const queue = this.queues.get(baseId);
    const worker = this.workers.get(baseId);
    let closed = false;

    if (queue) {
      try {
        await queue.close();
        logs.log(`✅ Queue BullMQ pour ${baseId} fermée.`);
        this.queues.delete(baseId);
         closed = true;
      } catch (error) {
        logs.notifyErrors(`❌ Erreur fermeture queue ${baseId}`, {}, error);
      }
    }

    if (worker) {
      try {
        await worker.close();
        logs.log(`✅ Worker BullMQ pour ${baseId} fermé.`);
        this.workers.delete(baseId);
        closed = true;
      } catch (error) {
        logs.notifyErrors(`❌ Erreur fermeture worker ${baseId}`, {}, error);
      }
    }
    // Si un canal était actif, on supprime les listeners associés
    if (closed) {
        this.emitter.removeAllListeners(baseId);
        // Supprimer aussi les listeners spécifiques `baseId:event` peut être plus complexe
        // Garder une trace des listeners créés pourrait être nécessaire.
         // Pour l'instant, on laisse l'emitter global se vider par manque de references.
    }
  }

   /**
   * Ferme proprement toutes les connexions Redis, les queues et workers.
   * À appeler lors de l'arrêt gracieux de s_server.
   */
  async shutdown(): Promise<void> {
     console.log('🔌 Fermeture de RedisService...');
     // Ferme tous les workers et queues BullMQ
     const closePromises = [
         ...Array.from(this.workers.keys()).map(id => this.closeCommunicationChannel(id)),
         // N'attend pas explicitement la fermeture des workers/queues ci-dessus pour accélérer
     ];
     await Promise.allSettled(closePromises); // Tente de tout fermer
     this.workers.clear();
     this.queues.clear();

     // Ferme les clients ioredis
     await this.client.quit();
     // await this.subscriber?.quit();
     // await this.publisher?.quit();
     console.log('✅ RedisService arrêté.');
  }
}

// Exporte une instance unique (Singleton)
export default new RedisService();

// Assurer l'arrêt propre lors de la fermeture de l'application
process.on('SIGINT', async () => {
  console.log('SIGINT reçu, arrêt de RedisService...');
  const redisService = new RedisService();
  await redisService.shutdown();
  process.exit(0);
});
process.on('SIGTERM', async () => {
    const redisService = new RedisService();
  console.log('SIGTERM reçu, arrêt de redisService...');
   await redisService.shutdown();
  process.exit(143); // Code standard pour SIGTERM
});