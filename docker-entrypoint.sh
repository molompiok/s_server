#!/bin/sh
# /usr/local/bin/docker-entrypoint-s_server.sh

set -e # Arrête le script en cas d'erreur

echo "[s_server Entrypoint] Démarrage du conteneur s_server..."
echo "[s_server Entrypoint] NODE_ENV: ${NODE_ENV}"
echo "[s_server Entrypoint] PORT: ${PORT}" # Afficher le port utilisé

# Vérifier que les variables d'environnement essentielles pour la BDD sont là
if [ -z "$DB_HOST" ] || [ -z "$DB_USER" ] || [ -z "$DB_PASSWORD" ] || [ -z "$DB_DATABASE" ]; then
    echo "[s_server Entrypoint] ERREUR: Variables d'environnement pour la base de données (s_server) manquantes."
    # Ne pas afficher DB_PASSWORD
    echo "DB_HOST: $DB_HOST, DB_USER: $DB_USER, DB_DATABASE: $DB_DATABASE"
    exit 1
fi

# Optionnel: Attente active de la base de données et de Redis
# Utilise netcat (nc) qui a été installé
WAIT_TIMEOUT=60 # Attendre au maximum 60 secondes
count=0
echo "[s_server Entrypoint] Attente de la base de données (${DB_HOST}:${DB_PORT:-5432})..."
while ! nc -z -w5 "${DB_HOST}" "${DB_PORT:-5432}" && [ "$count" -lt "$WAIT_TIMEOUT" ]; do
  echo "  Base de données non disponible - nouvelle tentative dans 5s... ($((count+5))s/${WAIT_TIMEOUT}s)"
  sleep 5
  count=$((count+5))
done
if [ "$count" -ge "$WAIT_TIMEOUT" ]; then
  echo "[s_server Entrypoint] ERREUR: Timeout en attente de la base de données."
  exit 1
fi
echo "[s_server Entrypoint] Base de données PostgreSQL détectée !"

count=0
echo "[s_server Entrypoint] Attente de Redis (${REDIS_HOST}:${REDIS_PORT:-6379})..."
while ! nc -z -w5 "${REDIS_HOST}" "${REDIS_PORT:-6379}" && [ "$count" -lt "$WAIT_TIMEOUT" ]; do
  echo "  Redis non disponible - nouvelle tentative dans 5s... ($((count+5))s/${WAIT_TIMEOUT}s)"
  sleep 5
  count=$((count+5))
done
if [ "$count" -ge "$WAIT_TIMEOUT" ]; then
  echo "[s_server Entrypoint] ERREUR: Timeout en attente de Redis."
  exit 1
fi
echo "[s_server Entrypoint] Redis détecté !"


# Exécuter les migrations de la base de données pour s_server
echo "[s_server Entrypoint] Exécution des migrations de la base de données principale de s_server..."
node ace migration:run --force

if [ $? -eq 0 ]; then
    echo "[s_server Entrypoint] Migrations pour s_server exécutées avec succès."
else
    echo "[s_server Entrypoint] ERREUR lors de l'exécution des migrations pour s_server."
    exit 1
fi

# Lancer la commande principale passée au conteneur (CMD dans Dockerfile)
echo "[s_server Entrypoint] Démarrage du serveur applicatif s_server (commande: $@)..."
exec "$@"