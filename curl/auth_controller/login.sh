#!/bin/bash

# Script pour se connecter et récupérer le token
# Usage: ./login.sh

BASE_URL="${BASE_URL:-http://localhost:5555}"
EMAIL="${EMAIL:-sublymus@gmail.com}"
PASSWORD="${PASSWORD:-pioukioulou}"

TOKEN_FILE="$(dirname "$0")/../token"

echo "🔐 Connexion avec $EMAIL..."

RESPONSE=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$EMAIL\",
    \"password\": \"$PASSWORD\"
  }")

echo "Réponse du serveur:"
echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"

# Extraire le token de la réponse (essayer jq d'abord, puis grep/sed en fallback)
if command -v jq &> /dev/null; then
  TOKEN=$(echo "$RESPONSE" | jq -r '.token' 2>/dev/null)
else
  # Fallback: utiliser grep et sed pour extraire le token
  TOKEN=$(echo "$RESPONSE" | grep -o '"token":"[^"]*"' | sed 's/"token":"\([^"]*\)"/\1/')
fi

if [ -n "$TOKEN" ] && [ "$TOKEN" != "null" ] && [ "${#TOKEN}" -gt 10 ]; then
  echo "$TOKEN" > "$TOKEN_FILE"
  echo "✅ Token sauvegardé dans $TOKEN_FILE"
  echo "Token: ${TOKEN:0:50}..."
else
  echo "❌ Erreur: Impossible de récupérer le token"
  echo "Réponse complète: $RESPONSE"
  exit 1
fi

