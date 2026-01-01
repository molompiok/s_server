# Phase 1: Fondations Wallets - Implementation Complete

## Objectif
Creer automatiquement un wallet OWNER_MAIN pour chaque utilisateur lors de la verification de son email.

---

## Fichiers Crees

### 1. Service Wave (`app/services/payments/wave.ts`)
**Role**: Pont entre s_server et wave-api

**Fonctionnalites**:
- Basculement automatique prod/dev avec `isProd`
  - Prod: `https://wallet.sublymus.com`
  - Dev: `http://127.0.0.1:3002`
- Headers d'authentification (Bearer + X-Manager-Id)
- Timeout 15s sur tous les appels
- Gestion d'erreurs avec logging

**Methodes implementees**:
- `createWallet()` - Creer un wallet (OWNER_MAIN, STORE, AFFILIATE_EARNINGS)
- `getWalletStats()` - Recuperer stats d'un wallet
- `createPaymentIntent()` - Creer PaymentIntent avec splits
- `getPaymentIntent()` - Details d'un PaymentIntent
- `internalTransfer()` - Transfert entre wallets
- `releaseTransaction()` - Release manuel ON_HOLD
- `createPayout()` - Retrait vers Wave
- `getWalletTransactions()` - Liste des transactions

---

## Fichiers Modifies

### 2. Migration (`database/migrations/1764856531013_create_add_wave_wallet_to_users_table.ts`)
Ajout de 2 colonnes a la table `users`:
- `wave_main_wallet_id` (string, nullable, unique)
- `wave_affiliate_wallet_id` (string, nullable, unique)

### 3. Modele User (`app/models/user.ts`)
Ajout des colonnes:
```typescript
@column()
declare wave_main_wallet_id: string | null

@column()
declare wave_affiliate_wallet_id: string | null
```

### 4. AuthController (`app/controllers/auth_controller.ts`)

#### `verifyEmail()` (ligne ~224)
Ajout logique de creation wallet apres verification email:
```typescript
if (!user.wave_main_wallet_id) {
    const wallet = await waveService.createWallet({
        label: `Main Wallet - ${user.full_name || user.email}`,
        type: 'OWNER_MAIN',
        currency: 'XOF',
    })
    user.wave_main_wallet_id = wallet.id
}
```

#### `google_callback()` (ligne ~948 & ~986)
- Creation wallet pour nouveaux utilisateurs OAuth
- Verification et creation pour utilisateurs existants sans wallet

### 5. Variables d'environnement

#### `.env.example`
```env
# Wave API Configuration
WAVE_API_URL=https://wallet.sublymus.com
WAVE_API_PORT=3002
WAVE_API_KEY=
WAVE_MANAGER_ID=
WAVE_WEBHOOK_SECRET=

# Wave Platform Wallets
WAVE_PLATFORM_WALLET_ID=
```

#### `start/env.ts`
Validation des nouvelles variables (toutes optionnelles pour ne pas casser l'existant):
- WAVE_API_URL
- WAVE_API_PORT
- WAVE_API_KEY
- WAVE_MANAGER_ID
- WAVE_WEBHOOK_SECRET
- WAVE_PLATFORM_WALLET_ID

---

## Flux d'Execution

### Cas 1: Inscription Classique (Email)
1. User fait POST /auth/register
2. Compte cree avec status='NEW' et email_verified_at=null
3. Email de verification envoye
4. User clique sur lien -> GET /auth/verify-email?token=xxx
5. **verifyEmail()** execute:
   - user.email_verified_at = DateTime.now()
   - **Appel wave-api: createWallet(OWNER_MAIN)**
   - user.wave_main_wallet_id = wallet.id
   - Redirection vers dashboard avec JWT

### Cas 2: Inscription OAuth Google
1. User se connecte avec Google
2. **google_callback()** execute:
   - Si nouveau user:
     - User.create() avec email_verified_at = DateTime.now()
     - **Appel wave-api: createWallet(OWNER_MAIN)**
   - Si user existant:
     - Verification si wave_main_wallet_id existe
     - **Si null: createWallet(OWNER_MAIN)**
   - Redirection avec JWT

### Cas 3: Collaborateur Invite (worker_actions.ts)
1. Owner invite un collaborateur
2. User cree avec status='NEW' (pas de wallet)
3. Email d'invitation envoye
4. Collaborateur confirme -> verifyEmail()
5. **Wallet cree lors de verifyEmail()** (meme flux que Cas 1)

---

## Logs Ajoutes

```typescript
logger.info({ user_id, wallet_id }, 'Owner main wallet created')
logger.info({ user_id, wallet_id }, 'Owner main wallet created (OAuth)')
logger.info({ user_id, wallet_id }, 'Owner main wallet created (existing user)')

logger.error({ user_id, error }, 'Failed to create owner main wallet')
```

---

## Gestion d'Erreurs

### Strategie Fail-Safe
Si la creation du wallet echoue:
- L'erreur est loggee
- La verification d'email continue normalement
- User peut se connecter
- Wallet peut etre cree plus tard (retry manuel ou automatique)

**Rationale**:
- Ne pas bloquer l'inscription a cause d'un probleme temporaire wave-api
- Meilleure UX
- Permet retry ulterieur

---

## Tests Requis

### 1. Test Creation Wallet - Inscription Classique
```bash
# 1. S'inscrire avec email
POST /auth/register
{
  "full_name": "Test User",
  "email": "test@example.com",
  "password": "Password123",
  "password_confirmation": "Password123"
}

# 2. Recuperer token depuis email
# 3. Confirmer email
GET /auth/verify-email?token=email_xxxxx

# 4. Verifier DB: users.wave_main_wallet_id doit etre rempli
# 5. Verifier wave-api: wallet existe avec label "Main Wallet - Test User"
```

### 2. Test Creation Wallet - OAuth Google
```bash
# 1. Se connecter avec Google (nouveau compte)
GET /auth/google/redirect?client_success=...&client_error=...

# 2. Apres callback, verifier DB: users.wave_main_wallet_id rempli
# 3. Se reconnecter avec meme compte Google
# 4. Verifier: wallet_id reste identique
```

### 3. Test Resilience
```bash
# 1. Arreter wave-api
# 2. S'inscrire normalement
# 3. Verifier: inscription reussit meme si wallet non cree
# 4. Verifier logs: erreur loggee mais pas d'exception
# 5. Redemarrer wave-api
# 6. Implementer retry manuel (futur)
```

---

## Prochaines Etapes (Phase 2)

1. **Migration**: Executer `node ace migration:run`
2. **Configuration**: Remplir les variables WAVE_* dans .env
3. **Tests**: Valider les 3 scenarios ci-dessus
4. **Phase 2**: Creation wallet STORE lors de la creation d'une boutique

---

## Notes Importantes

### isProd Detection
Le service utilise `isProd` depuis `app/Utils/functions.ts`:
```typescript
export const isProd = env.get('NODE_ENV') == 'production'
```

### Security
- wave-api utilise Bearer token + X-Manager-Id
- Ces credentials ne doivent JAMAIS etre exposes au frontend
- Toutes les operations wallet passent par s_server (serveur securise)

### Performance
- Timeout 15s pour eviter blocage indefini
- Appels wave-api asynchrones (pas de blocage UI)
- En cas d'echec, l'inscription n'est pas bloquee

---

**Status**: ✅ Complete et pret pour tests
**Date**: 2024-01-04
**Auteur**: Claude Code
