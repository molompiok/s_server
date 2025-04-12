// app/models/api.ts

import { DateTime } from 'luxon'
import limax from 'limax';
import { BaseModel, beforeCreate, beforeSave, column } from '@adonisjs/lucid/orm'

export default class Api extends BaseModel {

  @column({ isPrimary: true })
  declare id: string 

  @column()
  declare name: string 

  @column()
  declare slug : string; 

  @column()
  declare description: string | null 

  @column()
  declare docker_image_name: string //ex: 'sublymus/api'

  @column()
  declare docker_image_tag: string //ex: 'latest', 'v1.2.3'

  @column()
  declare internal_port: number //ex: 3334

  // Optionnel: Chemin source ou  URL Git
  @column()
  declare source_path: string | null


  @column()
  declare is_default: boolean // Est-ce l'API par défaut pour les nouveaux stores ?

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @beforeCreate()
  public static async generateSlug(api: Api) {
    let baseSlug = limax(api.name, { maintainCase: false })
    api.slug = baseSlug
  }
  
  @beforeSave()
  public static async saveSlug(api: Api) {
    if (api.name) {
      let baseSlug = limax(api.name, { maintainCase: false })
      let slug = baseSlug

      // Vérifier l'unicité du slug
      let count = 0
      while (await Api.findBy('slug', slug)) {
        count++
        if(count > 5) throw new Error('Pas de slug touver pour cette api, changer le nom de la api')
        slug = `${baseSlug}-${count}`
      }
      api.slug = slug
    }
  }

  get fullImageName(): string {
    return `${this.docker_image_name}:${this.docker_image_tag}`;
  }
  static async findDefault(): Promise<Api | null> {
    return await Api.query().where('is_default', true).first()
  }
}