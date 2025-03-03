import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class Api extends BaseModel {
  @column({ isPrimary: true })
  declare id: string

  @column()
  declare name: string
  
  @column()
  declare version: string
  
  @column()
  declare source: string
  
  @column()
  declare internal_port: string
  
  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}