#!/bin/bash

echo "===== Démarrage de la Plateforme Sublymus ====="

# --- 0. Vérification des dépendances (optionnel mais bon) ---
# command -v docker >/dev/null 2>&1 || { echo >&2 "Docker non trouvé. Installation requise."; exit 1; }
# command -v systemctl >/dev/null 2>&1 || { echo >&2 "systemctl non trouvé. Ce script est optimisé pour systemd."; }

# --- 1. S'assurer que les services d'infrastructure sont actifs ---
echo "[INFO] Vérification des services d'infrastructure..."

services_to_check=("docker" "nginx" "postgresql" "redis-server") # Noms peuvent varier
for service in "${services_to_check[@]}"; do
    if systemctl is-active --quiet "$service"; then
        echo "[OK] $service est actif."
    else
        echo "[WARN] $service n'est pas actif. Tentative de démarrage..."
        sudo systemctl start "$service"
        sleep 2 # Laisse un peu de temps
        if systemctl is-active --quiet "$service"; then
            echo "[OK] $service démarré avec succès."
        else
            echo "[ERROR] Échec du démarrage de $service. Vérifiez les logs du service."
            # exit 1; # On pourrait choisir de s'arrêter ici si un service critique manque
        fi
    fi
done

# --- 2. S'assurer que le réseau Docker Swarm existe ---
DOCKER_SWARM_NETWORK_NAME="${DOCKER_SWARM_NETWORK_NAME:-sublymus_net}" # Utilise var d'env ou défaut
if ! docker network inspect "$DOCKER_SWARM_NETWORK_NAME" > /dev/null 2>&1; then
    echo "[INFO] Réseau Docker Swarm '${DOCKER_SWARM_NETWORK_NAME}' non trouvé. Création..."
    docker network create --driver overlay --attachable --subnet 10.10.0.0/16 "$DOCKER_SWARM_NETWORK_NAME"
    if [ $? -ne 0 ]; then
        echo "[ERROR] Échec de la création du réseau Docker Swarm '${DOCKER_SWARM_NETWORK_NAME}'."
        exit 1
    fi
    echo "[OK] Réseau Docker Swarm '${DOCKER_SWARM_NETWORK_NAME}' créé."
else
    echo "[OK] Réseau Docker Swarm '${DOCKER_SWARM_NETWORK_NAME}' existant."
fi


# --- 3. Démarrer/Mettre à jour s_server ---
# Le service s_server doit être défini dans un fichier docker-compose.yml ou via une commande docker service create/update
# Ici, on suppose qu'il est déjà créé et on force une mise à jour pour s'assurer qu'il utilise la dernière image
# et qu'il a le bon nombre de répliques (généralement 1 pour s_server).

S_SERVER_SERVICE_NAME="s_server"
S_SERVER_IMAGE="sublymus/s_server:latest" # Assurez-vous que cette image est disponible (build via hook Git)
S_SERVER_REPLICAS=1

echo "[INFO] Vérification/Démarrage du service ${S_SERVER_SERVICE_NAME}..."

# Vérifier si le service existe
if ! docker service inspect "$S_SERVER_SERVICE_NAME" > /dev/null 2>&1; then
    echo "[WARN] Service Swarm ${S_SERVER_SERVICE_NAME} non trouvé. Vous devez le créer manuellement une fois."
    echo "Exemple de commande de création (à adapter) :"
    echo "docker service create --name ${S_SERVER_SERVICE_NAME} \\"
    echo "  --replicas ${S_SERVER_REPLICAS} \\"
    echo "  --network ${DOCKER_SWARM_NETWORK_NAME} \\"
    echo "  -p 5555:5555 \\" # TODO Adapter le port si besoin
    echo "  --env-file /path/to/s_server.env \\" # Fichier avec vos variables d'environnement
    echo "  --mount type=bind,source=/var/run/docker.sock,target=/var/run/docker.sock \\" # Pour que s_server contrôle Docker
    echo "  --mount type=bind,source=/srv/sublymus/nginx-conf,target=/etc/nginx/sites-enabled \\" # Exemple de montage pour les confs Nginx
    echo "  --mount type=bind,source=/srv/sublymus/api-volumes,target=/volumes/api \\" # Exemple de montage pour les volumes des API
    echo "  ${S_SERVER_IMAGE}"
    # TODO  ajouter un /srv/sublymus/server-volume
    # exit 1; # Optionnel: s'arrêter si s_server n'est pas défini
else
    echo "[INFO] Mise à jour du service ${S_SERVER_SERVICE_NAME} pour assurer l'utilisation de l'image ${S_SERVER_IMAGE} et ${S_SERVER_REPLICAS} répliques..."
    docker service update \
        --image "$S_SERVER_IMAGE" \
        --replicas "$S_SERVER_REPLICAS" \
        "$S_SERVER_SERVICE_NAME"

    if [ $? -ne 0 ]; then
        echo "[ERROR] Échec de la mise à jour du service Swarm ${S_SERVER_SERVICE_NAME}."
        # exit 1;
    else
        echo "[OK] Service ${S_SERVER_SERVICE_NAME} mis à jour/démarré."
    fi
fi

echo "[INFO] s_server est (ou devrait être) en cours de démarrage."
echo "[INFO] s_server va maintenant orchestrer le démarrage des autres services (thèmes, apps, stores)."
echo "===== Fin du script de démarrage de la plateforme ====="