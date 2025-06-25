import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class StoreCollaborator extends BaseModel {
  @column({ isPrimary: true })
  declare id: string
  
  @column()
  declare store_id: string;
  
  @column()
  declare user_id: string;

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}