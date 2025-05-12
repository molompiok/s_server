// app/Models/ContactMessage.ts
import { DateTime } from 'luxon'
import { BaseModel, beforeCreate, column } from '@adonisjs/lucid/orm'
import { nanoid } from 'nanoid'

export type ContactMessageStatus = 'new' | 'read' | 'replied' | 'archived'

export default class ContactMessage extends BaseModel {
  public static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare name: string

  @column()
  declare email: string

  @column()
  declare subject: string

  @column()
  declare message: string

  @column()
  declare status: ContactMessageStatus

  @column.dateTime({ autoCreate: true })
  declare created_at: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updated_at: DateTime

  @beforeCreate()
  public static async assignUuid(contactMessage: ContactMessage) {
    if (!contactMessage.id) {
      contactMessage.id = `msg_${nanoid(10)}`
    }
  }
}