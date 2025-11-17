#!/bin/bash

# Script pour vérifier qu'une API et un thème sont mis par défaut
# Usage: ./check_defaults.sh

BASE_URL="${BASE_URL:-http://localhost:5555}"
TOKEN_FILE="$(cd "$(dirname "$0")" && pwd)/token"

if [ ! -f "$TOKEN_FILE" ]; then
  echo "❌ Erreur: Token non trouvé. Exécutez d'abord auth_controller/login.sh"
  exit 1
fi

TOKEN=$(cat "$TOKEN_FILE")

echo "🔍 Vérification des APIs et thèmes par défaut..."

# Vérifier les APIs
echo ""
echo "📋 Liste des APIs:"
APIS_RESPONSE=$(curl -s -X GET "$BASE_URL/apis" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json")

echo "$APIS_RESPONSE" | jq '.' 2>/dev/null || echo "$APIS_RESPONSE"

# Essayer jq d'abord, puis Python en fallback
if command -v jq &> /dev/null; then
  DEFAULT_API=$(echo "$APIS_RESPONSE" | jq -r '.data[] | select(.is_default == true) | .id' 2>/dev/null | sed -n '1p' 2>/dev/null)
else
  # Fallback avec Python
  DEFAULT_API=$(echo "$APIS_RESPONSE" | python3 -c "import sys, json; data=json.load(sys.stdin); apis=[a for a in data.get('data', []) if a.get('is_default')]; print(apis[0]['id'] if apis else '')" 2>/dev/null)
fi

if [ -n "$DEFAULT_API" ] && [ "$DEFAULT_API" != "null" ]; then
  API_INFO=$(echo "$APIS_RESPONSE" | jq -r ".data[] | select(.id == \"$DEFAULT_API\")" 2>/dev/null)
  echo ""
  echo "✅ API par défaut trouvée:"
  echo "$API_INFO" | jq '{id, name, docker_image_name, docker_image_tag, internal_port, is_default}' 2>/dev/null || echo "$API_INFO"
else
  echo ""
  echo "❌ Aucune API par défaut trouvée"
fi

# Vérifier les thèmes
echo ""
echo "🎨 Liste des thèmes:"
THEMES_RESPONSE=$(curl -s -X GET "$BASE_URL/themes" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json")

echo "$THEMES_RESPONSE" | jq '.' 2>/dev/null || echo "$THEMES_RESPONSE"

# Essayer jq d'abord, puis Python en fallback
if command -v jq &> /dev/null; then
  DEFAULT_THEME=$(echo "$THEMES_RESPONSE" | jq -r '.list[]? | select(.is_default == true) | .id' 2>/dev/null | sed -n '1p' 2>/dev/null)
else
  # Fallback avec Python
  DEFAULT_THEME=$(echo "$THEMES_RESPONSE" | python3 -c "import sys, json; data=json.load(sys.stdin); themes=[t for t in data.get('list', []) if t.get('is_default')]; print(themes[0]['id'] if themes else '')" 2>/dev/null)
fi

if [ -n "$DEFAULT_THEME" ] && [ "$DEFAULT_THEME" != "null" ]; then
  THEME_INFO=$(echo "$THEMES_RESPONSE" | jq -r ".data[] | select(.id == \"$DEFAULT_THEME\")" 2>/dev/null)
  echo ""
  echo "✅ Thème par défaut trouvé:"
  echo "$THEME_INFO" | jq '{id, name, docker_image_name, docker_image_tag, internal_port, is_default}' 2>/dev/null || echo "$THEME_INFO"
else
  echo ""
  echo "⚠️  Aucun thème par défaut trouvé (peut être optionnel)"
fi

echo ""
if [ -n "$DEFAULT_API" ] && [ "$DEFAULT_API" != "null" ]; then
  echo "✅ Configuration prête pour créer une boutique"
else
  echo "❌ Configuration incomplète: API par défaut requise"
  exit 1
fi

