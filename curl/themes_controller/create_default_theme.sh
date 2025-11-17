#!/bin/bash

# Script pour créer un thème par défaut avec busybox
# Usage: ./create_default_theme.sh

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
THEME_NAME="theme-busybox-default-${TIMESTAMP}"

# Utiliser l'image de test réutilisable
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TEST_IMAGE="$SCRIPT_DIR/../test_image.png"

if [ ! -f "$TEST_IMAGE" ]; then
  echo "❌ Erreur: Image de test non trouvée: $TEST_IMAGE"
  exit 1
fi

echo "🎨 Création d'un thème par défaut avec busybox (port 3000)..."
echo "📝 Détails de la requête:"
echo "   - Image: $TEST_IMAGE"
echo "   - Taille image: $(ls -lh "$TEST_IMAGE" | awk '{print $5}')"
echo "   - Type image: $(file "$TEST_IMAGE" | cut -d: -f2)"

RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" -X POST "$BASE_URL/themes" \
  -H "Authorization: Bearer $TOKEN" \
  -F "name=$THEME_NAME" \
  -F "description=Thème par défaut avec busybox pour les tests" \
  -F "docker_image_name=busybox" \
  -F "docker_image_tag=latest" \
  -F "internal_port=3000" \
  -F "is_default=true" \
  -F "is_public=true" \
  -F "is_active=true" \
  -F "preview_images_0=@$TEST_IMAGE" 2>&1)

# Séparer le code HTTP et le body
HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE:" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '/HTTP_CODE:/d')

echo ""
echo "📊 Code HTTP: $HTTP_CODE"
echo "📄 Réponse du serveur:"
echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"

# Afficher les détails d'erreur si présents
if echo "$BODY" | grep -q "error\|errors\|message" 2>/dev/null; then
  echo ""
  echo "❌ Détails de l'erreur:"
  echo "$BODY" | jq -r '.errors // .error // .message' 2>/dev/null || echo "$BODY"
fi

# Vérifier si la réponse contient un ID ou une erreur
if echo "$BODY" | jq -e '.id' > /dev/null 2>&1; then
  THEME_ID=$(echo "$BODY" | jq -r '.id' 2>/dev/null)
  echo "✅ Thème créé avec succès. ID: $THEME_ID"
elif echo "$BODY" | jq -e '.error' > /dev/null 2>&1; then
  echo "❌ Erreur lors de la création du thème:"
  echo "$BODY" | jq -r '.error' 2>/dev/null || echo "$BODY"
  exit 1
else
  echo "⚠️  Réponse inattendue:"
  echo "$BODY"
  # Essayer quand même d'extraire l'ID
  THEME_ID=$(echo "$BODY" | jq -r '.id // empty' 2>/dev/null)
  if [ -n "$THEME_ID" ] && [ "$THEME_ID" != "null" ]; then
    echo "✅ Thème créé avec succès. ID: $THEME_ID"
  fi
fi

