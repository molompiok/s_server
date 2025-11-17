#!/bin/bash

# Script principal pour exécuter tous les tests dans l'ordre
# Usage: ./run_all_tests.sh

set -e  # Arrêter en cas d'erreur

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BASE_URL="${BASE_URL:-http://localhost:5555}"

echo "🚀 Démarrage des tests pour s_server"
echo "URL de base: $BASE_URL"
echo ""

# 1. Login
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "1️⃣  Étape 1: Connexion et récupération du token"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
cd "$SCRIPT_DIR/auth_controller"
./login.sh || {
  echo "❌ Échec de la connexion"
  exit 1
}
echo ""

# 2. Vérifier les APIs et thèmes par défaut
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "2️⃣  Étape 2: Vérification des APIs et thèmes par défaut"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
cd "$SCRIPT_DIR"
./check_defaults.sh || {
  echo "⚠️  Pas d'API/thème par défaut, ils seront créés automatiquement"
}
echo ""

# 3. Créer API par défaut si nécessaire
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "3️⃣  Étape 3: Vérification/Création de l'API par défaut"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
cd "$SCRIPT_DIR/api_controller"
echo "Vérification des APIs existantes..."
./get_apis.sh | grep -q '"is_default":\s*true' || {
  echo "Aucune API par défaut trouvée, création..."
  ./create_default_api.sh || {
    echo "⚠️  Échec de la création de l'API, mais on continue..."
  }
}
echo ""

# 4. Créer thème par défaut si nécessaire
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "4️⃣  Étape 4: Vérification/Création du thème par défaut"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
cd "$SCRIPT_DIR/themes_controller"
echo "Vérification des thèmes existants..."
./get_themes.sh | grep -q '"is_default":\s*true' || {
  echo "Aucun thème par défaut trouvé, création..."
  ./create_default_theme.sh || {
    echo "⚠️  Échec de la création du thème, mais on continue..."
  }
}
echo ""

# 5. Créer une boutique
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "5️⃣  Étape 5: Création d'une boutique"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
cd "$SCRIPT_DIR/stores_controller"
./create_store.sh || {
  echo "❌ Échec de la création de la boutique"
  exit 1
}
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Tous les tests sont terminés avec succès!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

