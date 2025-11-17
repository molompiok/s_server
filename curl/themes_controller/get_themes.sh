#!/bin/bash

# Script pour récupérer la liste des thèmes
# Usage: ./get_themes.sh

BASE_URL="${BASE_URL:-http://localhost:5555}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TOKEN_FILE="$SCRIPT_DIR/../token"

if [ ! -f "$TOKEN_FILE" ]; then
  echo "❌ Erreur: Token non trouvé. Exécutez d'abord login.sh"
  exit 1
fi

TOKEN=$(cat "$TOKEN_FILE")

echo "📋 Récupération de la liste des thèmes..."

RESPONSE=$(curl -s -X GET "$BASE_URL/themes" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json")

echo "Réponse du serveur:"
echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"

