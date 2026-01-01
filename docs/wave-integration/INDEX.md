# Wave Integration Documentation - Index

Documentation complete de l'integration de wave-api dans s_server.

---

## Documents Disponibles

### 1. [PHASE_1_WALLETS.md](./PHASE_1_WALLETS.md)
**Sujet**: Implementation Phase 1 - Creation automatique des wallets owners
**Contenu**:
- Service wave.ts (pont s_server ↔ wave-api)
- Migration users (wave_main_wallet_id, wave_affiliate_wallet_id)
- Integration dans auth_controller (verifyEmail + OAuth)
- Variables d'environnement
- Tests requis

**Status**: ✅ Complete

---

### 2. [CORRECTIONS_WAVE_SERVICE.md](./CORRECTIONS_WAVE_SERVICE.md)
**Sujet**: Corrections du service Wave - Alignement avec wave-api
**Contenu**:
- Retrait de WAVE_WEBHOOK_SECRET
- Correction createWallet() (entity_type au lieu de type)
- Correction internalTransfer() (route et parametres)
- Correction releaseTransaction() (3 modes de release)
- Verification schemas vine vs implementation

**Status**: ✅ Complete

---

### 3. [ARCHITECTURE_SSE.md](./ARCHITECTURE_SSE.md)
**Sujet**: Architecture Server-Sent Events (SSE) avec Transmit
**Contenu**: À venir
- Integration @adonisjs/transmit
- Canaux SSE par scope
- Gestion des evenements temps reel
- Connexion frontend

**Status**: 🔜 À venir

---

### 4. [SERVICE_PAYMENT_EVENTS.md](./SERVICE_PAYMENT_EVENTS.md)
**Sujet**: Service de gestion des paiements avec validation
**Contenu**: À venir
- Payment event handler
- Validation des donnees
- Appels wave-api securises
- Gestion d'erreurs

**Status**: 🔜 À venir

---

## Architecture Globale

```
s_server (Serveur Securise)
├── Services
│   ├── payments/wave.ts         → Appels wave-api (server-to-server)
│   └── payments/events.ts       → Gestion evenements paiement (à venir)
├── Models
│   └── user.ts
│       └── ensureMainWalletExists() → Methode idempotente
└── Controllers
    └── auth_controller.ts       → Utilise ensureMainWalletExists()

wave-api (API Wallets)
├── Routes Serveur (Bearer + X-Manager-Id)
│   ├── POST /v1/wallets
│   ├── POST /v1/checkout/complex
│   ├── POST /v1/transactions/transfer
│   └── POST /v1/transactions/release
└── EventBus (SSE)
    └── Transmit channels
```

---

## Principes de Securite

1. **API Key Protection**
   - ❌ s_api n'a JAMAIS accès à WAVE_API_KEY
   - ✅ Toutes les operations wallet passent par s_server
   - ✅ Headers requis: Authorization Bearer + X-Manager-Id

2. **Validation en Couches**
   - Validation Vine dans wave-api
   - Validation metier dans s_server
   - Logs a chaque etape

3. **Idempotence**
   - ensureMainWalletExists() peut etre appelee plusieurs fois
   - Aucun effet de bord si wallet existe deja

---

## Prochaines Phases

### Phase 2: Creation Store → Wallet STORE
- [ ] Migration stores (wave_store_wallet_id)
- [ ] Store.ensureStoreWalletExists()
- [ ] Integration dans stores_controller

### Phase 3: Plans d'Abonnement
- [ ] Models: SubscriptionPlan, StoreSubscription
- [ ] Paiement abonnements via wave-api
- [ ] Calcul reductions + commissions

### Phase 4: Affiliation Plateforme
- [ ] Models: AffiliateCode, StoreAffiliate, AffiliatePayment
- [ ] Validation codes (duree 6 mois)
- [ ] Anti-fraude: owner ne peut utiliser son propre code

### Phase 5: Paiement Commandes (s_api)
- [ ] Service payment events (depuis s_server)
- [ ] Webhook s_api pour confirmations
- [ ] Release ON_HOLD apres 48h

---

**Derniere mise a jour**: 2025-01-04
**Auteur**: Claude Code
