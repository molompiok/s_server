import { DateTime } from 'luxon'
import { BaseModel, beforeCreate, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Store from './store.js'
import SubscriptionPlan from './subscription_plan.js'
import User from './user.js'
import { randomUUID } from 'node:crypto'

export type SubscriptionStatus = 'pending' | 'active' | 'cancelled' | 'expired'

export default class StoreSubscription extends BaseModel {
  @column({ isPrimary: true })
  declare id: string

  @beforeCreate()
  static assignId(subscription: StoreSubscription) {
    subscription.id = `sub_${randomUUID()}`
  }

  @column()
  declare store_id: string

  @column()
  declare plan_id: string

  @column()
  declare status: SubscriptionStatus

  @column.dateTime()
  declare starts_at: DateTime

  @column.dateTime()
  declare expires_at: DateTime

  @column()
  declare wave_payment_intent_id: string | null

  @column()
  declare affiliate_code: string | null

  @column()
  declare affiliate_user_id: string | null

  @column.dateTime()
  declare affiliate_expires_at: DateTime | null

  @column()
  declare amount_paid: number | null

  @column()
  declare duration_months: number

  @column({
    prepare: (value: any) => JSON.stringify(value),
  })
  declare metadata: Record<string, any> | null

  @belongsTo(() => Store, {
    foreignKey: 'store_id',
  })
  declare store: BelongsTo<typeof Store>

  @belongsTo(() => SubscriptionPlan, {
    foreignKey: 'plan_id',
  })
  declare plan: BelongsTo<typeof SubscriptionPlan>

  @belongsTo(() => User, {
    foreignKey: 'affiliate_user_id',
  })
  declare affiliateUser: BelongsTo<typeof User>

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  /**
   * Vérifie si l'abonnement est actif
   */
  get isActive(): boolean {
    return this.status === 'active' && this.expires_at > DateTime.now()
  }

  /**
   * Vérifie si l'abonnement est expiré
   */
  get isExpired(): boolean {
    return this.expires_at <= DateTime.now()
  }

  /**
   * Nombre de jours restants avant expiration
   */
  get daysRemaining(): number {
    if (this.isExpired) return 0
    return Math.ceil(this.expires_at.diff(DateTime.now(), 'days').days)
  }

  /**
   * Vérifie si la relation d'affiliation est encore active
   */
  get isAffiliateActive(): boolean {
    if (!this.affiliate_expires_at) return false
    return this.affiliate_expires_at > DateTime.now()
  }
}
