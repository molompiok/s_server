# Tests cURL pour s_server

Ce dossier contient les scripts de test pour le serveur s_server.

## Structure

```
curl/
├── token                    # Fichier contenant le token d'authentification
├── auth_controller/         # Tests d'authentification
├── stores_controller/       # Tests des boutiques
├── api_controller/         # Tests des APIs
├── themes_controller/       # Tests des thèmes
└── check_defaults.sh        # Vérification des APIs/thèmes par défaut
```

## Utilisation

### 1. Se connecter et récupérer le token

```bash
cd curl/auth_controller
./login.sh
```

Le token sera sauvegardé dans `../token`

### 2. Vérifier les APIs et thèmes par défaut

```bash
cd curl
./check_defaults.sh
```

### 3. Créer une API par défaut (si nécessaire)

```bash
cd curl/api_controller
./create_default_api.sh
```

### 4. Créer un thème par défaut (si nécessaire)

```bash
cd curl/themes_controller
./create_default_theme.sh
```

### 5. Créer une boutique

```bash
cd curl/stores_controller
./create_store.sh
```

## Variables d'environnement

Vous pouvez personnaliser l'URL de base et les identifiants :

```bash
export BASE_URL="http://localhost:5555"
export EMAIL="sublymus@gmail.com"
export PASSWORD="pioukioulou"
```

## Ordre d'exécution recommandé

### Option 1: Exécution automatique (recommandé)

```bash
cd curl
./run_all_tests.sh
```

Ce script exécute automatiquement toutes les étapes dans l'ordre.

### Option 2: Exécution manuelle

1. `auth_controller/login.sh` - Récupérer le token
2. `check_defaults.sh` - Vérifier la configuration
3. `api_controller/create_default_api.sh` - Si pas d'API par défaut
4. `themes_controller/create_default_theme.sh` - Si pas de thème par défaut
5. `stores_controller/create_store.sh` - Créer une boutique

