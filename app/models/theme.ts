// app/models/theme.ts

import { DateTime } from 'luxon'
import limax from 'limax';
import { BaseModel, beforeCreate, beforeSave, column } from '@adonisjs/lucid/orm'

export default class Theme extends BaseModel {

  @column({ isPrimary: true })
  declare id: string 

  @column()
  declare name: string

  @column()
  declare slug : string; 

  @column()
  declare description: string | null
  
  @column({
    prepare(value) {
      return JSON.stringify(value);
    },
  })
  declare views: string[]
  
  @column()
  declare docker_image_name: string //ex: 'sublymus/api'

  @column()
  declare docker_image_tag: string //ex: 'latest', 'v1.2.3'

  @column()
  declare internal_port: number //ex: 3334

  // Optionnel: Chemin source ou URL Git
  @column()
  declare source_path: string | null

  @column()
  declare is_public: boolean // Thème utilisable par tous ?

  @column({ serializeAs: null }) 
  declare is_active: boolean 

  @column({ serializeAs: null }) 
  declare is_running: boolean 

  @column()
  declare is_default: boolean // un seul theme par defaut

  // Optionnel: Prévision Marketplace
  @column()
  declare is_premium: boolean
  
  @column()
  declare price: boolean
  
  @column()
  declare creator_id: string | null

  //TODO ajouter , price, gerer creator upload process,
  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @beforeCreate()
  public static async generateSlug(theme: Theme) {
    let baseSlug = limax(theme.name, { maintainCase: false })
    theme.slug = baseSlug
  }
  
  @beforeSave()
  public static async saveSlug(theme: Theme) {
    if (theme.name) {
      let baseSlug = limax(theme.name, { maintainCase: false })
      let slug = baseSlug

      // Vérifier l'unicité du slug
      let count = 0
      while (await Theme.findBy('slug', slug)) {
        count++
        if(count > 5) throw new Error('Pas de slug touver pour cette theme, changer le nom de la theme')
        slug = `${baseSlug}-${count}`
      }
      theme.slug = slug
    }
  }


  get fullImageName(): string {
    return `${this.docker_image_name}:${this.docker_image_tag}`;
  }


  static async findPublicThemes(): Promise<Theme[]> {
    return await Theme.query().where('is_public', true).orderBy('name').exec()
  }
  

  static async findDefault(): Promise<Theme|null> {
    return await Theme.query().where('is_default', true).first()
  }
}