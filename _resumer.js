
/*
Résumé de l'Architecture Sublymus
Objectif Général : Fournir une plateforme SaaS permettant aux PME africaines (en commençant par la Côte d'Ivoire) de créer et gérer facilement leur boutique en ligne professionnelle, avec une adaptation aux besoins locaux (paiements mobiles, etc.) et des fonctionnalités modernes (AR potentielle).
Composants Principaux :
s_server (Serveur Central - Application AdonisJS) :
Rôle : Point d'entrée principal (potentiellement via sublymus.com), gestion centrale de la plateforme, API admin, gestion des comptes utilisateurs de la plateforme (propriétaires de boutiques), gestion des métadonnées des stores et des thèmes, orchestration des services, fournisseur de services partagés.
Technologie : AdonisJS (Node.js).
Fonctionnalités Clés :
API REST/GraphQL pour l'administration de la plateforme (gestion des stores, thèmes, utilisateurs plateforme, plans...).
Orchestration Docker Swarm : Utilise SwarmService (via Dockerode) pour créer, mettre à jour, scaler et supprimer les services Swarm des s_api et des theme.
Provisioning : Utilise ProvisioningService pour créer/supprimer les utilisateurs/groupes Linux, les volumes Docker et les bases de données/utilisateurs PostgreSQL pour chaque boutique.
Routage Nginx : Utilise RoutingService pour générer et gérer les configurations Nginx, assurant le routage des domaines personnalisés et des slugs (/store-slug/) vers les services theme ou s_api appropriés. Injecte l'en-tête X-Target-Api-Service pour les thèmes.
Initiation Auth Sociale : Gère les redirections et callbacks OAuth2, puis appelle l'API interne de s_api pour finaliser.
Fournisseur de Services Partagés : Reçoit des demandes via BullMQ des s_api/theme pour exécuter des tâches comme l'envoi d'emails (via MailService), notifications push, appels API externes sécurisés, traitements IA (futur).
Gestion du Scaling : Reçoit les demandes de scaling (request_scale_up/down) via BullMQ et les applique via SwarmService après vérification.
Traitement des Événements (Worker BullMQ) : Possède un worker BullMQ (service_event_worker.ts avec des handlers dédiés) pour écouter la queue service-to-server+s_server et traiter les demandes/notifications venant des s_api et theme.
s_api (API par Boutique - Application AdonisJS) :
Rôle : Backend spécifique à une boutique. Gère les données de la boutique (produits, commandes, clients), l'authentification des clients de la boutique, la logique métier spécifique. Chaque boutique active a son propre service s_api dans Swarm.
Technologie : AdonisJS (Node.js).
Fonctionnalités Clés :
API REST/GraphQL pour les opérations de la boutique (gestion produits, paniers, commandes, clients boutique, etc.).
Authentification Locale (Email/Pass + Vérification) : Gère l'inscription, la vérification d'email (via demande d'envoi à s_server), et la connexion des clients de la boutique. Stocke les utilisateurs dans sa propre base de données. Utilise les Access Tokens Adonis.
Finalisation Auth Sociale : Possède une route interne sécurisée (/_internal/auth/social-callback) appelée par s_server pour créer/lier l'utilisateur et générer le token d'accès.
Base de Données Isolée : Chaque s_api se connecte à sa propre base de données PostgreSQL provisionnée par s_server.
Communication vers s_server (Client BullMQ) : Utilise ApiBullMQService pour envoyer des messages (jobs) à s_server via la queue service-to-server+s_server (ex: demander envoi email, demander scaling, notifier nouvelle commande).
Réception de Commandes (Worker BullMQ - Optionnel/Futur) : Pourrait avoir un worker pour écouter les messages de s_server (via server-to-service+{storeId}) pour des mises à jour de configuration ou des commandes admin spécifiques. (Le ping/pong est déjà géré par ApiBullMQService).
Monitoring de Charge (Auto-Scaling) : Intègre LoadMonitorService pour surveiller l'Event Loop Lag et envoyer automatiquement des demandes de scaling à s_server.
theme (Frontend par Type de Thème - SSR/SPA) :
Rôle : Frontend visible par les clients finaux. Affiche les produits, le panier, etc. Un même service theme (ex: theme_minimalist) peut servir plusieurs boutiques qui utilisent ce thème. Tourne comme un service Swarm.
Technologie : Node.js avec un framework frontend (ex: Express+Vike/Next.js/Nuxt pour SSR, ou simple serveur pour SPA).
Fonctionnalités Clés :
Rendu des pages de la boutique (SSR ou service de fichiers pour SPA).
Appels à s_api : Lit l'en-tête X-Target-Api-Service (injecté par Nginx) pour connaître le nom du service Swarm api_store_... à appeler pour récupérer les données spécifiques à la boutique actuelle. Fait des appels HTTP internes (via fetch, axios) en utilisant ce nom de service.
Communication vers s_server (Client BullMQ) : Utilise un client BullMQ (similaire à s_api) pour envoyer des messages à s_server (ex: demander scaling).
Monitoring de Charge (Auto-Scaling) : Intègre LoadMonitorService pour surveiller sa propre charge et demander le scaling à s_server.
Nginx (Reverse Proxy) :
Rôle : Point d'entrée HTTP/HTTPS public. Gère les certificats SSL/TLS (via Certbot/Let's Encrypt). Route les requêtes vers le service approprié (s_server, theme_..., ou api_store_...) en fonction du domaine ou du chemin (/store-slug/).
Configuration : Gérée dynamiquement par RoutingService dans s_server.
Fonctionnalité Clé : Injecte l'en-tête X-Target-Api-Service lorsqu'il route vers un service theme.
PostgreSQL (Base de Données) :
Rôle : Stockage persistant.
Structure : Une instance PostgreSQL centrale hébergeant :
Une base de données pour s_server (métadonnées plateforme).
Une base de données séparée pour chaque boutique (store_xyz_db), avec un utilisateur PG dédié (store_xyz_user) qui est propriétaire de cette DB.
Redis (Cache & Bus de Messages) :
Rôle :
Stockage clé-valeur rapide pour le cache (sessions, données temporaires).
Backend pour BullMQ, permettant la communication asynchrone fiable entre les services.
Utilisation : Utilisé par s_server, s_api, theme via RedisService (côté s_server) et des clients Redis/BullMQ (côté s_api/theme).
BullMQ (Système de Queues de Messages) :
Rôle : Gère la communication asynchrone, découplée et résiliente.
Queues Principales :
service-to-server+s_server : Utilisée par s_api et theme pour envoyer des requêtes/notifications à s_server.
server-to-service+{entityId} : (Utilisation future/limitée) Pourrait être utilisée par s_server pour envoyer des commandes spécifiques à une s_api ou un theme.
Docker Swarm (Orchestration) :
Rôle : Gère le déploiement, le scaling, le réseau et la haute disponibilité des services conteneurisés (s_server, s_api, theme, Nginx, Redis, PostgreSQL).
Réseau : Utilise un réseau overlay (ex: sublymus_net) permettant aux services de communiquer via leurs noms de service.
Flux de Données & Interactions Clés :
Accès Client : Navigateur -> Nginx -> theme (ou s_api si pas de thème) -> theme appelle s_api (via nom de service) -> s_api accède à sa DB PG.
Administration : Admin -> s_server API -> s_server modifie sa DB / appelle SwarmService, ProvisioningService, RoutingService.
Auth Email/Pass : Client -> s_api -> s_api DB -> (Job BullMQ vers s_server pour email vérif) -> s_server -> MailService.
Auth Sociale : Client -> s_server -> Google -> s_server -> HTTP Interne -> s_api -> s_api DB -> s_api retourne token -> s_server -> Client.
Scaling : s_api/theme (monitor) -> Job BullMQ -> s_server (worker) -> SwarmService.
Services Partagés : s_api/theme -> Job BullMQ -> s_server (worker) -> Service correspondant (Mail, Push, etc.).
Cette architecture vise un bon équilibre entre isolation (DB et API par store), partage des ressources (thèmes, services centraux), communication découplée (BullMQ) et orchestration standard (Docker Swarm).

*/












