import { DateTime } from 'luxon'
import { BaseModel, column, hasMany } from '@adonisjs/lucid/orm'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import StoreSubscription from './store_subscription.js'

export default class SubscriptionPlan extends BaseModel {
  @column({ isPrimary: true })
  declare id: string

  @column()
  declare name: string

  @column()
  declare monthly_price: number

  @column()
  declare commission_rate: number

  @column()
  declare max_products: number | null

  @column()
  declare max_categories: number | null

  @column()
  declare custom_domain: boolean

  @column()
  declare analytics: boolean

  @column()
  declare priority_support: boolean

  @column({
    prepare: (value: string[]) => JSON.stringify(value),
  })
  declare features: string[]

  @column()
  declare is_active: boolean

  @column()
  declare sort_order: number

  @hasMany(() => StoreSubscription, {
    foreignKey: 'plan_id',
  })
  declare subscriptions: HasMany<typeof StoreSubscription>

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
