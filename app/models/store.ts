import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class Store extends BaseModel {
  @column({ isPrimary: true })
  declare id: string
  
  @column()
  declare user_id: string

  @column()
  declare name: string

  @column()
  declare logo: string

  @column()
  declare banner: string

  @column()
  declare description: string

  @column()
  declare domaines: string
  
  @column()
  declare current_theme_id: string
    
  @column()
  declare api_port: number

  @column.dateTime({})
  declare expire_at: DateTime

  @column()
  declare disk_storage_limit_gb: number

  @column()
  declare is_active: boolean


  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}