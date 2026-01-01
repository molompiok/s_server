# Service de Gestion des Paiements - Payment Event Handler

## Objectif

Centraliser la gestion des paiements dans s_server pour:
1. **Securite**: s_api ne manipule JAMAIS WAVE_API_KEY
2. **Validation**: Toutes les donnees sont validees avant appel wave-api
3. **Logs**: Tracabilite complete des operations
4. **SSE**: Evenements temps reel pour les dashboards

---

## Architecture

```
s_api (E-commerce)
    |
    | Event via Redis/BullMQ
    |
    v
s_server (Gestionnaire Securise)
    |
    | Validation Vine
    |
    v
payment_event_handler.ts
    |
    | Appels Authentifies
    |
    v
wave-api (Wallet API)
```

---

## Fichier: `app/services/payments/event_handler.ts`

### Events Supportes

| Event | Description | Validation |
|-------|-------------|------------|
| `wallet.create` | Creation wallet | owner_id, entity_type required |
| `payment.intent.create` | Checkout Wave | splits, urls required |
| `transaction.transfer` | Transfert interne | wallets, amount, category |
| `transaction.release` | Release ON_HOLD | ledger_entry_id OU external_reference |
| `payout.create` | Retrait Wave | wallet_id, amount, phone |

---

## Usage

### 1. Depuis un Job BullMQ

```typescript
import paymentEventHandler from '#services/payments/event_handler'

// Dans un worker
export default class PaymentWorker {
  async process(job: Job) {
    const result = await paymentEventHandler.handle(job.data)
    return result
  }
}
```

### 2. Depuis un Controleur

```typescript
import paymentEventHandler from '#services/payments/event_handler'

export default class PaymentsController {
  async createIntent({ request, response }: HttpContext) {
    const result = await paymentEventHandler.handle({
      event: 'payment.intent.create',
      data: request.body()
    })

    return response.created(result)
  }
}
```

---

## Exemples d'Evenements

### Event 1: wallet.create

```typescript
{
  event: 'wallet.create',
  data: {
    owner_id: 'user_xxx',
    owner_name: 'John Doe',
    entity_type: 'VENDOR',
    currency: 'XOF',
    overdraft_limit: 0
  }
}
```

**Reponse**:
```json
{
  "id": "wlt_xxx",
  "owner_id": "user_xxx",
  "entity_type": "VENDOR",
  "balance_accounting": 0,
  "balance_available": 0
}
```

---

### Event 2: payment.intent.create

```typescript
{
  event: 'payment.intent.create',
  data: {
    external_reference: 'order_12345',
    amount: 10000,
    currency: 'XOF',
    source_system: 's_api',
    success_url: 'https://shop.example.com/success',
    error_url: 'https://shop.example.com/error',
    splits: [
      {
        wallet_id: 'wlt_vendor',
        amount: 9500,
        category: 'ORDER_PAYMENT',
        label: 'Produits commande #12345',
        release_delay_hours: 48
      },
      {
        wallet_id: 'wlt_platform',
        amount: 500,
        category: 'COMMISSION',
        label: 'Commission plateforme'
      }
    ]
  }
}
```

**Reponse**:
```json
{
  "payment_intent_id": "pi_xxx",
  "wave_checkout_url": "https://pay.wave.com/xxx",
  "status": "pending"
}
```

---

### Event 3: transaction.transfer

```typescript
{
  event: 'transaction.transfer',
  data: {
    from_wallet_id: 'wlt_store',
    to_wallet_id: 'wlt_main',
    amount: 50000,
    label: 'Transfert store -> main',
    category: 'ADJUSTMENT',
    external_reference: 'transfer_xxx',
    source_system: 's_server'
  }
}
```

**Reponse**:
```json
{
  "message": "Transfert effectue",
  "data": {
    "transaction_group_id": "tx_xxx",
    "from_wallet_id": "wlt_store",
    "to_wallet_id": "wlt_main",
    "amount": 50000
  }
}
```

---

### Event 4: transaction.release

**Option A: Par ledger_entry_id**
```typescript
{
  event: 'transaction.release',
  data: {
    ledger_entry_id: 'le_xxx'
  }
}
```

**Option B: Par external_reference**
```typescript
{
  event: 'transaction.release',
  data: {
    external_reference: 'order_12345'
  }
}
```

**Option C: Par external_reference + wallet_id (precis)**
```typescript
{
  event: 'transaction.release',
  data: {
    external_reference: 'order_12345',
    wallet_id: 'wlt_vendor'
  }
}
```

---

### Event 5: payout.create

```typescript
{
  event: 'payout.create',
  data: {
    wallet_id: 'wlt_main',
    amount: 100000,
    phone_number: '+225 0759020515',
    external_reference: 'payout_xxx'
  }
}
```

**Reponse**:
```json
{
  "payout_id": "po_xxx",
  "status": "pending",
  "amount": 100000,
  "fees": 1000
}
```

---

## Gestion d'Erreurs

### Erreurs de Validation

```typescript
{
  code: 'E_VALIDATION_ERROR',
  message: 'Validation failed',
  errors: [
    {
      field: 'data.amount',
      message: 'amount must be at least 1'
    }
  ]
}
```

### Erreurs wave-api

```typescript
{
  message: 'Wave API error: 400',
  details: 'Wallet not found'
}
```

### Erreurs Reseau

```typescript
{
  message: 'Failed to call Wave API',
  error: 'Timeout after 15000ms'
}
```

---

## Logs

### Niveau INFO

```log
{
  "level": "info",
  "msg": "Processing payment event",
  "event": "payment.intent.create"
}

{
  "level": "info",
  "msg": "Creating payment intent",
  "external_reference": "order_12345",
  "amount": 10000,
  "splits_count": 2
}

{
  "level": "info",
  "msg": "Payment intent created",
  "payment_intent_id": "pi_xxx",
  "external_reference": "order_12345"
}
```

### Niveau ERROR

```log
{
  "level": "error",
  "msg": "Payment event handling failed",
  "event": "payment.intent.create",
  "error": "Wave API error: 400",
  "stack": "..."
}
```

---

## Integration avec SSE (Futur)

Le service peut emettre des evenements SSE pour notifier les dashboards en temps reel:

```typescript
private async handlePaymentIntentCreate(event: any) {
  const intent = await waveService.createPaymentIntent(...)

  // Emettre evenement SSE
  eventBus.emitEvent({
    type: 'payment.intent.created',
    referenceId: intent.payment_intent_id,
    scopes: ['admin', `store:${storeId}`],
    payload: {
      payment_intent_id: intent.payment_intent_id,
      amount: intent.amount,
      status: intent.status
    }
  })

  return intent
}
```

---

## Securite

### Protection API Key

✅ **CORRECT**:
```
s_api → Event → s_server → wave-api (avec API key)
```

❌ **INCORRECT**:
```
s_api → wave-api (expose API key)
```

### Headers wave-api

Tous les appels incluent automatiquement:
- `Authorization: Bearer ${WAVE_API_KEY}`
- `X-Manager-Id: ${WAVE_MANAGER_ID}`

### Validation en Couches

1. **Vine Schema**: Format et types
2. **Business Logic**: Regles metier
3. **wave-api**: Validation finale

---

## Tests

### Test Unitaire

```typescript
import { test } from '@japa/runner'
import paymentEventHandler from '#services/payments/event_handler'

test('creates wallet with valid data', async ({ assert }) => {
  const result = await paymentEventHandler.handle({
    event: 'wallet.create',
    data: {
      owner_id: 'test_user',
      entity_type: 'VENDOR',
      currency: 'XOF'
    }
  })

  assert.exists(result.id)
  assert.equal(result.owner_id, 'test_user')
})
```

### Test Integration

```typescript
test('rejects invalid event type', async ({ assert }) => {
  await assert.rejects(
    () => paymentEventHandler.handle({
      event: 'invalid.event' as any,
      data: {}
    }),
    'Unknown event type'
  )
})
```

---

**Status**: ✅ Implemente
**Date**: 2025-01-04
**Auteur**: Claude Code
