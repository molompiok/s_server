#!/bin/bash

# Script pour créer une boutique
# Usage: ./create_store.sh

BASE_URL="${BASE_URL:-http://localhost:5555}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TOKEN_FILE="$SCRIPT_DIR/../token"

if [ ! -f "$TOKEN_FILE" ]; then
  echo "❌ Erreur: Token non trouvé. Exécutez d'abord login.sh"
  exit 1
fi

TOKEN=$(cat "$TOKEN_FILE")

# Générer un nom unique avec timestamp et random
TIMESTAMP=$(date +%s)
RANDOM_SUFFIX=$(openssl rand -hex 4 2>/dev/null || echo "test")
STORE_NAME="store-test-${TIMESTAMP}-${RANDOM_SUFFIX}"

echo "🏪 Création d'une boutique: $STORE_NAME..."

# Utiliser l'image de test réutilisable
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TEST_IMAGE="$SCRIPT_DIR/../test_image.png"

if [ ! -f "$TEST_IMAGE" ]; then
  echo "❌ Erreur: Image de test non trouvée: $TEST_IMAGE"
  exit 1
fi

# Créer des copies temporaires avec les bons noms
TEMP_DIR=$(mktemp -d)
LOGO_FILE="$TEMP_DIR/logo_0.png"
COVER_FILE="$TEMP_DIR/cover_image_0.png"

cp "$TEST_IMAGE" "$LOGO_FILE"
cp "$TEST_IMAGE" "$COVER_FILE"

echo "📝 Détails de la requête:"
echo "   - Logo: $LOGO_FILE ($(ls -lh "$LOGO_FILE" | awk '{print $5}'))"
echo "   - Cover: $COVER_FILE ($(ls -lh "$COVER_FILE" | awk '{print $5}'))"
echo "   - Store name: $STORE_NAME"

RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" -X POST "$BASE_URL/stores" \
  -H "Authorization: Bearer $TOKEN" \
  -F "name=$STORE_NAME" \
  -F "title=Boutique de test $STORE_NAME" \
  -F "description=Description de la boutique de test créée automatiquement" \
  -F "logo_0=@$LOGO_FILE" \
  -F "cover_image_0=@$COVER_FILE" \
  -F "timezone=Europe/Paris" \
  -F "currency=EUR" 2>&1)

# Séparer le code HTTP et le body
HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE:" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '/HTTP_CODE:/d')

# Nettoyer les fichiers temporaires
rm -rf "$TEMP_DIR"

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

STORE_ID=$(echo "$BODY" | jq -r '.store.id' 2>/dev/null)

if [ -n "$STORE_ID" ] && [ "$STORE_ID" != "null" ]; then
  echo "✅ Boutique créée avec succès. ID: $STORE_ID"
  echo "Nom: $STORE_NAME"
else
  echo "❌ Erreur lors de la création de la boutique"
  exit 1
fi

