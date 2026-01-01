# Wave Integration - s_server Documentation

Documentation complete de l'integration de wave-api dans s_server.

---

## 📚 Table des Matieres

1. [PHASE_1_WALLETS.md](./PHASE_1_WALLETS.md) - Creation automatique wallets owners
2. [CORRECTIONS_WAVE_SERVICE.md](./CORRECTIONS_WAVE_SERVICE.md) - Alignement avec wave-api
3. [SERVICE_PAYMENT_EVENTS.md](./SERVICE_PAYMENT_EVENTS.md) - Gestion evenements paiement
4. [ARCHITECTURE_SSE.md](./ARCHITECTURE_SSE.md) - Server-Sent Events avec Transmit
5. [INDEX.md](./INDEX.md) - Index complet + architecture globale

---

## 🚀 Quick Start

### 1. Configuration

Ajouter dans `.env`:
```env
# Wave API Configuration
WAVE_API_URL=https://wallet.sublymus.com
WAVE_API_PORT=3002
WAVE_API_KEY=your_api_key
WAVE_MANAGER_ID=your_manager_id

# Wave Platform Wallets
WAVE_PLATFORM_WALLET_ID=wlt_xxx
```

### 2. Migration

```bash
node ace migration:run
```

Cela ajoute:
- `users.wave_main_wallet_id`
- `users.wave_affiliate_wallet_id`

### 3. Test

```bash
# Inscription
POST /auth/register

# Verification email (wallet cree automatiquement)
GET /auth/verify-email?token=xxx

# Verifier DB
SELECT wave_main_wallet_id FROM users WHERE email = 'test@example.com';
```

---

## 🏗️ Architecture

```
s_server (Serveur Securise)
│
├─ Services
│  ├─ payments/wave.ts           → Appels wave-api (Bearer + X-Manager-Id)
│  └─ payments/event_handler.ts  → Validation + delegation
│
├─ Models
│  └─ user.ts
│     └─ ensureMainWalletExists() → Methode idempotente
│
└─ Controllers
   └─ auth_controller.ts          → Utilise ensureMainWalletExists()
```

---

## 🔒 Securite

### Principe Fondamental

❌ **JAMAIS**: s_api ne doit manipuler WAVE_API_KEY

✅ **TOUJOURS**: Passer par s_server pour les operations wallet

### Flow Securise

```
s_api (E-commerce)
    |
    | Event { type: 'payment.intent.create', data: {...} }
    |
    v
s_server (Securise)
    |
    | Validation Vine
    |
    v
PaymentEventHandler
    |
    | Bearer + X-Manager-Id
    |
    v
wave-api
```

---

## 📖 Fonctionnalites Implementees

### ✅ Phase 1 - Wallets Owners

- [x] Service wave.ts (pont s_server ↔ wave-api)
- [x] Migration users (wave_main_wallet_id)
- [x] User.ensureMainWalletExists() (idempotent)
- [x] Integration auth_controller (3 endroits)
- [x] Variables d'environnement
- [x] Documentation complete

### ✅ Payment Event Handler

- [x] Service event_handler.ts
- [x] Validation Vine pour 5 events
- [x] Logs complets (INFO + ERROR)
- [x] Gestion d'erreurs

### 📖 SSE (Documentation)

- [x] Architecture Transmit documentee
- [x] Integration frontend documentee
- [ ] Implementation s_server (optionnel)

---

## 🔜 Prochaines Phases

### Phase 2: Store Wallets

```typescript
// store.ts
async ensureStoreWalletExists(): Promise<string> {
  if (this.wave_store_wallet_id) {
    return this.wave_store_wallet_id
  }

  const wallet = await waveService.createWallet({
    owner_id: this.id,
    owner_name: this.name,
    entity_type: 'VENDOR',
    currency: 'XOF'
  })

  this.wave_store_wallet_id = wallet.id
  await this.save()

  return wallet.id
}
```

### Phase 3: Plans d'Abonnement

- Models: SubscriptionPlan, StoreSubscription
- Calcul reductions (5% mensuel / 10% annuel)
- Calcul commissions affiliation (20%)

### Phase 4: Affiliation Plateforme

- Models: AffiliateCode, StoreAffiliate, AffiliatePayment
- Validation codes (duree 6 mois)
- Anti-fraude: owner ne peut utiliser son propre code

### Phase 5: Paiement Commandes (s_api)

- Integration event_handler dans s_api
- Webhook confirmations
- Release ON_HOLD automatique (48h)

---

## 📊 Metriques

### API Calls wave-api

| Methode | Route | Frequence Estimee |
|---------|-------|-------------------|
| POST /v1/wallets | Creation wallet | 1x par user (idempotent) |
| POST /v1/checkout/complex | Checkout Wave | Par commande |
| POST /v1/transactions/transfer | Transfert interne | Par transfert store→main |
| POST /v1/transactions/release | Release ON_HOLD | Apres 48h ou confirmation |
| POST /v1/payouts | Retrait Wave | Par retrait owner |

### Performance

- Timeout: 15s par appel wave-api
- Cache: Aucun (donnees temps reel)
- Retry: Aucun (gestion d'erreur simple)

---

## 🧪 Tests

### Test Unitaire

```bash
node ace test
```

### Test Integration

```bash
# 1. Demarrer wave-api
cd /home/opus/src/wave-api
npm run dev

# 2. Demarrer s_server
cd /home/opus/src/s_server
npm run dev

# 3. Tester inscription
curl -X POST http://localhost:5555/auth/register \
  -H "Content-Type: application/json" \
  -d '{"full_name":"Test User","email":"test@example.com","password":"Test123456","password_confirmation":"Test123456"}'

# 4. Verifier wallet cree
SELECT * FROM wallets WHERE owner_id = (
  SELECT id FROM users WHERE email = 'test@example.com'
);
```

---

## 📝 Logs

### Niveau INFO

```log
{"level":"info","msg":"Main wallet created","user_id":"xxx","wallet_id":"wlt_xxx"}
{"level":"info","msg":"Processing payment event","event":"payment.intent.create"}
{"level":"info","msg":"Payment intent created","payment_intent_id":"pi_xxx"}
```

### Niveau ERROR

```log
{"level":"error","msg":"Failed to create main wallet","user_id":"xxx","error":"Wave API error: 400"}
{"level":"error","msg":"Payment event handling failed","event":"payment.intent.create","error":"..."}
```

---

## 🐛 Debugging

### Verifier Configuration

```bash
node -e "console.log(process.env.WAVE_API_KEY)"
# Doit afficher votre API key
```

### Tester Appel wave-api

```bash
curl -X POST https://wallet.sublymus.com/v1/wallets \
  -H "Authorization: Bearer ${WAVE_API_KEY}" \
  -H "X-Manager-Id: ${WAVE_MANAGER_ID}" \
  -H "Content-Type: application/json" \
  -d '{"owner_id":"test","entity_type":"VENDOR","currency":"XOF"}'
```

### Logs wave-api

```bash
# Dans wave-api
tail -f logs/app.log | grep wallet
```

---

## 🆘 Support

### Questions Frequentes

**Q: Pourquoi s_api ne peut pas appeler wave-api directement?**
R: Securite. WAVE_API_KEY ne doit JAMAIS etre expose a s_api qui est accessible publiquement.

**Q: Que se passe-t-il si wave-api est down?**
R: L'inscription continue (wallet cree plus tard), ou erreur selon le contexte.

**Q: Les wallets sont-ils vraiment idempotents?**
R: Oui. ensureMainWalletExists() retourne le wallet existant ou en cree un nouveau.

**Q: Comment tester sans wave-api?**
R: Mocker waveService dans les tests unitaires.

---

## 📞 Contact

- Documentation: `/home/opus/src/s_server/docs/wave-integration/`
- Code: `/home/opus/src/s_server/app/services/payments/`
- Issues: Reporter dans le repo

---

**Derniere mise a jour**: 2025-01-04
**Auteur**: Claude Code
**Version**: 1.0.0
