#!/bin/sh
# docker-entrypoint.sh pour s_api

set -e # Arrête le script en cas d'erreur

echo "[s_api Entrypoint] Démarrage du conteneur pour STORE_ID: ${STORE_ID:-Non défini}"
echo "[s_api Entrypoint] NODE_ENV: ${NODE_ENV}"

# Vérifier que les variables d'environnement essentielles pour la BDD sont là
if [ -z "$DB_HOST" ] || [ -z "$DB_USER" ] || [ -z "$DB_PASSWORD" ] || [ -z "$DB_DATABASE" ]; then
    echo "[s_api Entrypoint] ERREUR: Variables d'environnement pour la base de données manquantes."
    echo "DB_HOST: $DB_HOST, DB_USER: $DB_USER, DB_DATABASE: $DB_DATABASE"
    # DB_PASSWORD n'est pas affiché pour la sécurité
    exit 1
fi

echo "[s_api Entrypoint] Attente de la disponibilité de la base de données (${DB_HOST}:${DB_PORT:-5432})..."

# Exécuter les migrations de la base de données pour ce store
# --force est important en production pour ne pas demander de confirmation interactive
echo "[s_api Entrypoint] Exécution des migrations de la base de données pour le store..."
node ace migration:run --force

if [ $? -eq 0 ]; then
    echo "[s_api Entrypoint] Migrations exécutées avec succès (ou aucune migration à exécuter)."
else
    echo "[s_api Entrypoint] ERREUR lors de l'exécution des migrations."
    # Que faire ici ? Le conteneur va probablement s'arrêter si on exit 1.
    # C'est peut-être le comportement souhaité pour alerter d'un problème.
    exit 1
fi

# Lancer la commande principale passée au conteneur (CMD dans Dockerfile ou surchargée par Swarm)
echo "[s_api Entrypoint] Démarrage du serveur d'application (commande: $@)..."
exec "$@"