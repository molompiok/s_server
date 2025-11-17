#!/bin/bash

# Script pour créer une API par défaut avec busybox
# Usage: ./create_default_api.sh

BASE_URL="${BASE_URL:-http://localhost:5555}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TOKEN_FILE="$SCRIPT_DIR/../token"

if [ ! -f "$TOKEN_FILE" ]; then
  echo "❌ Erreur: Token non trouvé. Exécutez d'abord login.sh"
  exit 1
fi

TOKEN=$(cat "$TOKEN_FILE")

# Générer un nom unique avec timestamp
TIMESTAMP=$(date +%s)
API_NAME="api-busybox-default-${TIMESTAMP}"

echo "🚀 Création d'une API par défaut avec busybox (port 3334)..."

RESPONSE=$(curl -s -X POST "$BASE_URL/apis" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"$API_NAME\",
    \"description\": \"API par défaut avec busybox pour les tests\",
    \"docker_image_name\": \"busybox\",
    \"docker_image_tag\": \"latest\",
    \"internal_port\": 3334,
    \"is_default\": true
  }")

echo "Réponse du serveur:"
echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"

# Vérifier si la réponse contient un ID ou une erreur
if echo "$RESPONSE" | jq -e '.id' > /dev/null 2>&1; then
  API_ID=$(echo "$RESPONSE" | jq -r '.id' 2>/dev/null)
  echo "✅ API créée avec succès. ID: $API_ID"
elif echo "$RESPONSE" | jq -e '.error' > /dev/null 2>&1; then
  echo "❌ Erreur lors de la création de l'API:"
  echo "$RESPONSE" | jq -r '.error' 2>/dev/null || echo "$RESPONSE"
  exit 1
else
  echo "⚠️  Réponse inattendue, mais l'API semble créée"
  echo "$RESPONSE"
fi

