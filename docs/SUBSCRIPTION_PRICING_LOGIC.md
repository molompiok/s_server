# 📊 Logique de Tarification des Abonnements

> **Objectif** : Documenter précisément les calculs de prix, réductions, et commissions pour faciliter les ajustements futurs.

---

## 🧮 Formules de Calcul

### 1. Prix de Base

```typescript
basePrice = plan.monthly_price × duration_months
```

**Exemples** :
- Plan Pro (15.000 XOF) × 1 mois = **15.000 XOF**
- Plan Pro (15.000 XOF) × 12 mois = **180.000 XOF**

---

### 2. Réduction Durée

```typescript
if (duration === '12_months') {
  reductionRate = 0.10  // 10% de réduction
} else if (duration === '1_month') {
  reductionRate = 0.05  // 5% de réduction
}

priceAfterReduction = Math.round(basePrice × (1 - reductionRate))
```

**Exemples** :
| Plan | Durée | Base | Réduction | Prix Réduit |
|------|-------|------|-----------|-------------|
| Pro | 1 mois | 15.000 | 5% | **14.250** XOF |
| Pro | 12 mois | 180.000 | 10% | **162.000** XOF |
| Découverte | 12 mois | 60.000 | 10% | **54.000** XOF |

**⚠️ Pourquoi Math.round()** : Éviter les centimes (XOF n'a pas de subdivision)

---

### 3. Commission Affiliation

```typescript
if (affiliateCode && validatedAffiliateCode) {
  affiliateCommissionAmount = Math.round(priceAfterReduction × 0.20)
} else {
  affiliateCommissionAmount = 0
}

platformAmount = priceAfterReduction - affiliateCommissionAmount
```

**Exemple complet** (Plan Pro, 12 mois, code MARIE_PROMO) :
```
basePrice              = 15.000 × 12 = 180.000 XOF
priceAfterReduction    = 180.000 × 0.90 = 162.000 XOF  (réduction 10%)
affiliateCommission    = 162.000 × 0.20 = 32.400 XOF   (commission 20%)
platformAmount         = 162.000 - 32.400 = 129.600 XOF

┌─────────────────────────────────────┐
│ Client paie : 162.000 XOF           │
├─────────────────────────────────────┤
│ Plateforme reçoit : 129.600 XOF     │
│ Affilié reçoit    :  32.400 XOF     │
└─────────────────────────────────────┘
```

---

## 🔧 Paramètres Ajustables

### Fichier : [controllers/subscriptions_controller.ts](../app/controllers/subscriptions_controller.ts)

#### 📍 Ligne ~97-102 : Réductions Durée

```typescript
// AJUSTABLE : Taux de réduction selon durée
let reductionRate = 0
if (payload.duration === '12_months') {
  reductionRate = 0.10 // ← MODIFIER ICI pour changer réduction 12 mois
} else {
  reductionRate = 0.05 // ← MODIFIER ICI pour changer réduction 1 mois
}
```

**Scénarios d'ajustement** :
- **Promotion Black Friday** : Passer à 0.20 (20%) pour 12 mois
- **Inciter engagement court** : Passer 1 mois à 0.00 (pas de réduction)
- **Nouvelle stratégie** : Ajouter durée 6 mois avec 0.07 (7%)

---

#### 📍 Ligne ~135 : Commission Affiliation

```typescript
// AJUSTABLE : Commission affiliation
affiliateCommissionAmount = Math.round(priceAfterReduction * 0.20)
//                                                            ↑
//                                            MODIFIER ICI (actuellement 20%)
```

**Scénarios d'ajustement** :
- **Booster affiliation** : 0.25 (25%)
- **Réduire coûts** : 0.15 (15%)
- **Commission variable par plan** :
  ```typescript
  const commissionRates = {
    'free': 0,
    'decouverte': 0.15,
    'pro': 0.20,
    'grand_vendeur': 0.25
  }
  affiliateCommissionAmount = Math.round(
    priceAfterReduction * commissionRates[plan.id]
  )
  ```

---

#### 📍 Ligne ~159-175 : Splits Wave

```typescript
const splits = [
  {
    wallet_id: env.get('WAVE_PLATFORM_WALLET_ID'),
    amount: platformAmount,
    category: 'SUBSCRIPTION',
    label: `Abonnement ${plan.name} - ${durationMonths} mois`,
    release_delay_hours: 0, // ← AJUSTABLE : délai avant disponibilité
  },
]

if (affiliateCommissionAmount > 0 && affiliateWalletId) {
  splits.push({
    wallet_id: affiliateWalletId,
    amount: affiliateCommissionAmount,
    category: 'COMMISSION',
    label: `Commission affiliation - ${validatedAffiliateCode}`,
    release_delay_hours: 0, // ← AJUSTABLE : délai commission
  })
}
```

**Scénarios d'ajustement** :
- **Hold plateforme 24h** : `release_delay_hours: 24`
- **Hold commission 30j** : `release_delay_hours: 720` (validation fraude)

---

## 📋 Fichier : [seeders/subscription_plan_seeder.ts](../database/seeders/subscription_plan_seeder.ts)

### Plans et Commissions Plateforme

| Plan | Prix/mois | Commission Commandes | Localisation Code |
|------|-----------|----------------------|-------------------|
| Free | 0 | 0.20 (20%) | Ligne 12 |
| Découverte | 5.000 | 0.15 (15%) | Ligne 29 |
| Pro | 15.000 | 0.10 (10%) | Ligne 53 |
| Grand Vendeur | 40.000 | 0.05 (5%) | Ligne 81 |

**⚠️ Important** : `commission_rate` ici = commission sur les **commandes** (utilisée par s_api), **pas** commission affiliation

---

## 🧪 Tests de Non-Régression

Avant tout changement, valider ces cas :

### Test 1 : Plan Pro, 1 mois, sans code
```typescript
basePrice = 15.000 × 1 = 15.000
reduction = 15.000 × 0.05 = 750
priceAfterReduction = 14.250
affiliate = 0
platform = 14.250

✓ Client paie 14.250 XOF
✓ Plateforme reçoit 14.250 XOF
```

### Test 2 : Plan Pro, 12 mois, code MARIE_PROMO
```typescript
basePrice = 15.000 × 12 = 180.000
reduction = 180.000 × 0.10 = 18.000
priceAfterReduction = 162.000
affiliate = 162.000 × 0.20 = 32.400
platform = 129.600

✓ Client paie 162.000 XOF
✓ Plateforme reçoit 129.600 XOF
✓ MARIE_PROMO reçoit 32.400 XOF
```

### Test 3 : Plan Découverte, 12 mois, sans code
```typescript
basePrice = 5.000 × 12 = 60.000
reduction = 60.000 × 0.10 = 6.000
priceAfterReduction = 54.000
affiliate = 0
platform = 54.000

✓ Client paie 54.000 XOF
✓ Plateforme reçoit 54.000 XOF
```

---

## 🔄 Processus d'Ajustement

### 1. Modifier Paramètres

Éditer [subscriptions_controller.ts](../app/controllers/subscriptions_controller.ts) :
- Lignes 97-102 : réductions durée
- Ligne 135 : commission affiliation
- Lignes 159-175 : delays release

### 2. Tester Localement

```bash
# 1. Créer abonnement test
curl -X POST http://localhost:5555/stores/{id}/subscribe \
  -d '{"plan_id": "pro", "duration": "12_months", "affiliate_code": "TEST"}'

# 2. Vérifier calculs dans response.data
{
  "amount": 162000,  // priceAfterReduction
  "affiliate_commission": 32400  // doit correspondre
}

# 3. Vérifier logs
# Chercher "Subscription created" dans logs pour voir metadata
```

### 3. Déployer

```bash
# 1. Commit changements
git add app/controllers/subscriptions_controller.ts
git commit -m "feat: ajustement réductions abonnements (12 mois → 15%)"

# 2. Déployer
git push origin main

# 3. Vérifier en production
curl -X GET https://api.sublymus.com/stores/{id}/subscription/plans
```

---

## 📊 Métriques à Surveiller

Après ajustement, surveiller :

1. **Taux de conversion** : Abonnements créés / Visites page pricing
2. **Distribution durées** : % 1 mois vs 12 mois
3. **Utilisation codes affiliation** : % abonnements avec code
4. **Revenue moyen** : Moyenne `amount_paid` par abonnement

---

## 🚨 Erreurs Communes

### ❌ Oublier Math.round()

```typescript
// MAUVAIS
affiliateCommissionAmount = priceAfterReduction * 0.20
// Résultat : 32400.0000000004 XOF (problème float)

// BON
affiliateCommissionAmount = Math.round(priceAfterReduction * 0.20)
// Résultat : 32400 XOF
```

### ❌ Réduction sur prix original au lieu de base

```typescript
// MAUVAIS (réduction sur prix déjà réduit)
price1 = basePrice * 0.95  // Réduction 5%
finalPrice = price1 * 0.80  // Commission 20% → ERREUR

// BON (ordre correct)
priceAfterReduction = basePrice * 0.95
affiliateCommission = priceAfterReduction * 0.20
platformAmount = priceAfterReduction - affiliateCommission
```

### ❌ Splits ne totalisent pas le montant

```typescript
// VÉRIFIER TOUJOURS
const total = splits.reduce((sum, s) => sum + s.amount, 0)
if (total !== priceAfterReduction) {
  throw new Error('Splits mismatch!')
}
```

---

**Dernière mise à jour** : 2025-01-04
**Auteur** : Claude Code
**Révision** : v1.0
