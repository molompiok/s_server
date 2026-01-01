# Corrections du Service Wave - Alignement avec wave-api

## Changements Effectues

### 1. Retrait de WAVE_WEBHOOK_SECRET
**Rationale**: s_server n'a pas besoin de recevoir des webhooks de wave-api. Seul s_api en a besoin pour les confirmations de paiement.

**Fichiers modifies**:
- `.env.example`: Ligne supprimee
- `start/env.ts`: Validation supprimee

---

### 2. Correction de createWallet()

#### AVANT (Incorrect)
```typescript
async createWallet(payload: {
  currency?: string
  label: string
  type: 'OWNER_MAIN' | 'STORE' | 'AFFILIATE_EARNINGS' | 'PLATFORM'
})
```

#### APRES (Correct)
```typescript
async createWallet(payload: {
  owner_id: string
  owner_name?: string
  owner_wave_phone?: string
  entity_type: 'DRIVER' | 'VENDOR' | 'CLIENT' | 'PLATFORM'
  currency?: string
  overdraft_limit?: number
})
```

**Alignement avec wave-api**:
- Route: `POST /v1/wallets`
- Schema vine (wallets_controller.ts:26-33):
  ```typescript
  owner_id: vine.string(),
  owner_name: vine.string().optional(),
  owner_wave_phone: vine.string().optional(),
  entity_type: vine.enum(['DRIVER', 'VENDOR', 'CLIENT', 'PLATFORM']),
  currency: vine.string().fixedLength(3),
  overdraft_limit: vine.number().withoutDecimals().min(0).optional(),
  ```

**Mapping des types**:
- `OWNER_MAIN` → `entity_type: 'VENDOR'`
- `STORE` → `entity_type: 'VENDOR'`
- `AFFILIATE_EARNINGS` → `entity_type: 'VENDOR'`
- `PLATFORM` → `entity_type: 'PLATFORM'`

---

### 3. Correction de internalTransfer()

#### AVANT (Incorrect)
```typescript
async internalTransfer(payload: {
  from_wallet_id: string
  to_wallet_id: string
  amount: number
  category: string
  label: string
  external_reference?: string
})
```

#### APRES (Correct)
```typescript
async internalTransfer(payload: {
  from_wallet_id: string
  to_wallet_id: string
  amount: number
  label: string
  category: 'ORDER_PAYMENT' | 'SERVICE_PAYMENT' | 'COMMISSION' | 'ADJUSTMENT' | 'SUBSCRIPTION'
  external_reference?: string
  source_system?: string
})
```

**Changements**:
- `category` est maintenant un enum TypeScript strict
- Ajout de `source_system` (optionnel)
- Route corrigee: `/v1/transactions/transfer` (pas `/v1/wallets/transfer`)

**Alignement avec wave-api**:
- Route: `POST /v1/transactions/transfer`
- Schema vine (transactions_controller.ts:25-33)

---

### 4. Correction de releaseTransaction()

#### AVANT (Incorrect)
```typescript
async releaseTransaction(transactionId: string)
```

#### APRES (Correct)
```typescript
async releaseTransaction(payload: {
  ledger_entry_id?: string
  external_reference?: string
  wallet_id?: string
})
```

**Options supportees**:
1. **ledger_entry_id**: Release d'une entree specifique
2. **external_reference**: Release de toutes les entrees liees
3. **external_reference + wallet_id**: Release precis

**Alignement avec wave-api**:
- Route: `POST /v1/transactions/release`
- Schema vine (transactions_controller.ts:151-155)
- 3 modes de release supportes

---

### 5. Mise a Jour des Appels dans auth_controller.ts

#### Cas 1: verifyEmail() - Ligne ~227
```typescript
const wallet = await waveService.createWallet({
  owner_id: user.id,
  owner_name: user.full_name || user.email,
  entity_type: 'VENDOR',
  currency: 'XOF',
})
```

#### Cas 2: google_callback() - Nouveau utilisateur - Ligne ~951
```typescript
const wallet = await waveService.createWallet({
  owner_id: id,
  owner_name: user.full_name || user.email,
  entity_type: 'VENDOR',
  currency: 'XOF',
})
```

#### Cas 3: google_callback() - Utilisateur existant - Ligne ~990
```typescript
const wallet = await waveService.createWallet({
  owner_id: user.id,
  owner_name: user.full_name || user.email,
  entity_type: 'VENDOR',
  currency: 'XOF',
})
```

---

## Routes wave-api Couvertes par le Service

### Routes Implementees ✅

| Methode | Route | Service Method | Status |
|---------|-------|----------------|--------|
| POST | /v1/wallets | createWallet() | ✅ Corrige |
| GET | /v1/wallets/:id/stats | getWalletStats() | ✅ OK |
| POST | /v1/checkout/complex | createPaymentIntent() | ✅ OK |
| GET | /v1/checkout/:id | getPaymentIntent() | ✅ OK |
| POST | /v1/transactions/transfer | internalTransfer() | ✅ Corrige |
| POST | /v1/transactions/release | releaseTransaction() | ✅ Corrige |
| POST | /v1/payouts | createPayout() | ✅ OK |
| GET | /v1/wallets/:id/transactions | getWalletTransactions() | ✅ OK |
| GET | /v1/stats | Non implemente | 🔜 Futur |

### Routes Non Utilisees (pour s_server)

- `POST /v1/wallets/deposit` - Pour recharge client directe (pas necessaire pour s_server)
- `POST /v1/transactions/refund` - Gere par admin ou s_api
- `GET /v1/wallets/main` - Wallet plateforme (usage admin)

---

## Verification des Donnees

### Schemas vine vs Service wave.ts

#### createWallet
| Parametre | vine (wave-api) | Service (s_server) | Match |
|-----------|----------------|-------------------|-------|
| owner_id | required | required | ✅ |
| owner_name | optional | optional | ✅ |
| owner_wave_phone | optional | optional | ✅ |
| entity_type | enum | enum | ✅ |
| currency | fixedLength(3) | default XOF | ✅ |
| overdraft_limit | optional | optional | ✅ |

#### createPaymentIntent
| Parametre | vine (wave-api) | Service (s_server) | Match |
|-----------|----------------|-------------------|-------|
| amount | min(1) | required | ✅ |
| currency | fixedLength(3) | default XOF | ✅ |
| external_reference | required | required | ✅ |
| source_system | required | required | ✅ |
| success_url | url() | required | ✅ |
| error_url | url() | required | ✅ |
| splits | array(object) | array | ✅ |

#### internalTransfer
| Parametre | vine (wave-api) | Service (s_server) | Match |
|-----------|----------------|-------------------|-------|
| from_wallet_id | required | required | ✅ |
| to_wallet_id | required | required | ✅ |
| amount | min(1) | required | ✅ |
| label | required | required | ✅ |
| category | enum | enum | ✅ |
| external_reference | optional | optional | ✅ |
| source_system | optional | optional | ✅ |

---

## Tests a Effectuer

### 1. Test createWallet
```bash
# Demarrer wave-api
cd /home/opus/src/wave-api
npm run dev

# S'inscrire sur s_server
# Verifier email
# Observer les logs:
# - "Owner main wallet created"
# - Verifier wave_main_wallet_id dans DB
```

### 2. Test Types TypeScript
```bash
cd /home/opus/src/s_server
npm run typecheck
# Aucune erreur attendue
```

### 3. Test Integration Complete
```bash
# 1. Creer un utilisateur
# 2. Verifier le wallet dans wave-api DB
# 3. Verifier entity_type = 'VENDOR'
# 4. Verifier owner_id = user.id
```

---

## Notes Importantes

### entity_type vs "Type Logique"

Dans s_server, on parle de:
- OWNER_MAIN (wallet principal)
- STORE (wallet boutique)
- AFFILIATE_EARNINGS (wallet affiliation)

Mais dans wave-api, tout est `entity_type: 'VENDOR'` car ce sont tous des wallets de vendeurs.

La distinction OWNER_MAIN vs STORE se fait dans s_server via:
- `users.wave_main_wallet_id` → OWNER_MAIN
- `stores.wave_store_wallet_id` → STORE (a venir Phase 2)

### Securite

- ✅ `payerId` force a `managerId` dans payments_controller.ts:52
- ✅ Tous les wallets crees appartiennent au manager authentifie
- ✅ Headers requis: Authorization Bearer + X-Manager-Id

---

**Date**: 2025-01-04
**Status**: ✅ Corrections completees et testees (TypeScript)
**Auteur**: Claude Code
