# Architecture Server-Sent Events (SSE) avec Transmit

## Contexte

wave-api utilise `@adonisjs/transmit` pour diffuser des evenements en temps reel vers les dashboards et applications frontend.

s_server peut s'abonner a ces evenements ou en emettre ses propres.

---

## wave-api Implementation

### EventBus Service

**Fichier**: `wave-api/app/services/event_bus.ts`

```typescript
import transmit from '@adonisjs/transmit/services/main'

export type SseEvent = {
  type: string
  referenceId?: string
  scopes: string[]
  payload?: Record<string, any>
  timestamp?: string
}

class EventBus {
  emitEvent(event: SseEvent) {
    const payload = {
      ...event,
      timestamp: event.timestamp || new Date().toISOString()
    }

    // EventEmitter standard
    this.emit('event', payload)

    // Diffusion Transmit
    const channels = this.normalizeScopes(payload.scopes)
    for (const channel of channels) {
      transmit.broadcast(channel, payload)
    }
  }

  private normalizeScopes(scopes?: string[]) {
    // scopes: ['admin', 'store:xxx'] -> channels: ['admin', 'store/xxx']
    return scopes
      .filter((scope) => scope.trim().length > 0)
      .map((scope) => scope.replace(/:/g, '/'))
  }
}
```

---

## Scopes / Channels

### Conversion scope → channel

| Scope (Input) | Channel (Output) | Description |
|---------------|------------------|-------------|
| `admin` | `admin` | Admin dashboard |
| `store:abc123` | `store/abc123` | Boutique specifique |
| `user:xyz789` | `user/xyz789` | Utilisateur specifique |
| `wallet:wlt_xxx` | `wallet/wlt_xxx` | Wallet specifique |

---

## Events Emis par wave-api

### 1. payment.intent.created

```json
{
  "type": "payment.intent.created",
  "referenceId": "pi_xxx",
  "scopes": ["admin", "store:abc123"],
  "payload": {
    "payment_intent_id": "pi_xxx",
    "amount": 10000,
    "currency": "XOF",
    "status": "pending",
    "external_reference": "order_12345"
  },
  "timestamp": "2025-01-04T10:30:00Z"
}
```

### 2. payment.intent.succeeded

```json
{
  "type": "payment.intent.succeeded",
  "referenceId": "pi_xxx",
  "scopes": ["admin", "store:abc123"],
  "payload": {
    "payment_intent_id": "pi_xxx",
    "amount": 10000,
    "external_reference": "order_12345",
    "splits": [...]
  },
  "timestamp": "2025-01-04T10:32:00Z"
}
```

### 3. wallet.balance.updated

```json
{
  "type": "wallet.balance.updated",
  "referenceId": "wlt_xxx",
  "scopes": ["admin", "wallet:wlt_xxx"],
  "payload": {
    "wallet_id": "wlt_xxx",
    "old_balance": 50000,
    "new_balance": 60000,
    "change": 10000,
    "transaction_group_id": "tx_yyy"
  },
  "timestamp": "2025-01-04T10:32:01Z"
}
```

### 4. transaction.released

```json
{
  "type": "transaction.released",
  "referenceId": "le_xxx",
  "scopes": ["admin", "wallet:wlt_xxx"],
  "payload": {
    "ledger_entry_id": "le_xxx",
    "wallet_id": "wlt_xxx",
    "amount": 9500,
    "external_reference": "order_12345"
  },
  "timestamp": "2025-01-06T10:32:00Z"
}
```

---

## Integration s_server → wave-api SSE

### Option 1: Ecouter EventBus (Si s_server et wave-api same process)

**Non applicable** car services separes.

### Option 2: Webhook HTTP

wave-api peut envoyer des webhooks HTTP a s_server pour certains evenements.

**Pas implemente** dans wave-api actuellement (seul webhook Wave existe).

### Option 3: Frontend Direct

Le frontend (dashboard) se connecte directement a wave-api Transmit.

**✅ Recommande** pour dashboards temps reel.

---

## Frontend Connection (Dashboard)

### Installation

```bash
npm install @adonisjs/transmit-client
```

### Connexion au Stream

```typescript
import { Transmit } from '@adonisjs/transmit-client'

const transmit = new Transmit({
  baseUrl: 'https://wallet.sublymus.com' // wave-api URL
})

// S'abonner au canal admin
const subscription = transmit.subscription('admin')

await subscription.create()

// Ecouter les evenements
subscription.onMessage((event) => {
  console.log('Event received:', event)

  switch (event.type) {
    case 'payment.intent.created':
      // Afficher notification
      showNotification(`Nouveau paiement: ${event.payload.amount} XOF`)
      break

    case 'wallet.balance.updated':
      // Mettre a jour le solde affiche
      updateWalletBalance(event.payload.wallet_id, event.payload.new_balance)
      break
  }
})
```

### Multi-Channels

```typescript
// Dashboard admin: ecoute tout
const adminSub = transmit.subscription('admin')
await adminSub.create()

// Dashboard store specifique
const storeSub = transmit.subscription('store/abc123')
await storeSub.create()

// Dashboard wallet
const walletSub = transmit.subscription('wallet/wlt_xxx')
await walletSub.create()
```

---

## Emettre depuis s_server (Futur)

Si s_server veut emettre des evenements vers wave-api Transmit:

### Option A: Appel HTTP vers wave-api

```typescript
// Pas d'endpoint existant dans wave-api pour recevoir des events externes
// Il faudrait creer: POST /v1/events
```

### Option B: Transmit Direct (Si meme instance)

**Non applicable** car services separes.

### Option C: EventBus Local s_server

s_server peut avoir son propre EventBus + Transmit pour ses propres dashboards:

```typescript
// s_server/app/services/event_bus.ts
import transmit from '@adonisjs/transmit/services/main'

class ServerEventBus {
  emitEvent(event: {
    type: string
    scopes: string[]
    payload: any
  }) {
    const channels = event.scopes.map(s => s.replace(/:/g, '/'))
    for (const channel of channels) {
      transmit.broadcast(channel, event)
    }
  }
}

export default new ServerEventBus()
```

**Usage**:
```typescript
import eventBus from '#services/event_bus'

// Emettre evenement local
eventBus.emitEvent({
  type: 'subscription.updated',
  scopes: ['admin', 'store:abc123'],
  payload: {
    store_id: 'abc123',
    plan: 'PRO',
    status: 'active'
  }
})
```

---

## Architecture Complete

```
┌─────────────────┐
│   Frontend      │
│   (Dashboard)   │
└────────┬────────┘
         │
         │ Transmit Client
         │ (SSE Connection)
         │
         v
┌─────────────────────────────────┐
│       wave-api                  │
│  ┌──────────────────────────┐   │
│  │   Transmit Server        │   │
│  │   Channels:              │   │
│  │   - admin                │   │
│  │   - store/xxx            │   │
│  │   - wallet/xxx           │   │
│  └──────────────────────────┘   │
│                                 │
│  ┌──────────────────────────┐   │
│  │   EventBus               │   │
│  │   .emitEvent()           │   │
│  └──────────────────────────┘   │
└─────────────────────────────────┘

┌─────────────────────────────────┐
│       s_server                  │
│  ┌──────────────────────────┐   │
│  │   Transmit Server        │   │
│  │   (Optionnel)            │   │
│  │   Channels:              │   │
│  │   - admin                │   │
│  │   - store/xxx            │   │
│  └──────────────────────────┘   │
└─────────────────────────────────┘
```

---

## Configuration Transmit

### wave-api

**Fichier**: `wave-api/config/transmit.ts`

```typescript
import { defineConfig } from '@adonisjs/transmit'

export default defineConfig({
  pingInterval: '30s',
  transport: null // Utilisera l'implementation par defaut
})
```

### Routes Transmit

Transmit ajoute automatiquement la route:
- `GET /__transmit/events` (SSE endpoint)

---

## Securite

### Authentication

Transmit peut utiliser l'auth AdonisJS:

```typescript
// Frontend
const transmit = new Transmit({
  baseUrl: 'https://wallet.sublymus.com',
  headers: {
    Authorization: `Bearer ${accessToken}`
  }
})
```

### Authorization par Channel

```typescript
// wave-api: Authorizer
transmit.authorize('store/:id', (ctx, { id }) => {
  const user = ctx.auth.user
  return user.hasAccessToStore(id)
})
```

---

## Monitoring

### Logs wave-api

```log
{
  "level": "info",
  "msg": "[EventBus] Emission evenement SSE",
  "type": "payment.intent.created",
  "referenceId": "pi_xxx",
  "scopes": ["admin", "store:abc123"]
}

{
  "level": "info",
  "msg": "[EventBus] Canaux Transmit normalises",
  "type": "payment.intent.created",
  "channels": ["admin", "store/abc123"]
}

{
  "level": "info",
  "msg": "[EventBus] Evenement diffuse sur canal Transmit",
  "type": "payment.intent.created",
  "channel": "admin"
}
```

---

## Debugging

### Tester SSE avec curl

```bash
curl -N https://wallet.sublymus.com/__transmit/events?channel=admin
```

**Output**:
```
data: {"type":"payment.intent.created","payload":{...}}

data: {"type":"wallet.balance.updated","payload":{...}}
```

---

## Best Practices

1. **Channels Specifiques**: Utiliser des channels precis (store/xxx, wallet/xxx) plutot que diffuser sur 'admin' systematiquement

2. **Payload Minimal**: Ne pas envoyer de donnees sensibles ou volumineuses dans les events SSE

3. **Reconnection**: Le client doit gerer les reconnections automatiques

4. **Heartbeat**: Transmit envoie des pings reguliers pour garder la connexion active

5. **Cleanup**: Fermer les subscriptions quand le composant est demonte

---

**Status**: 📖 Documente (wave-api utilise deja Transmit)
**Date**: 2025-01-04
**Auteur**: Claude Code
