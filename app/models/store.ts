import { DateTime } from 'luxon'
import limax from 'limax';
import { BaseModel, beforeCreate, beforeSave, belongsTo, column } from '@adonisjs/lucid/orm'
import Api from './api.js'
import Theme from './theme.js'
import { type BelongsTo } from '@adonisjs/lucid/types/relations'

export default class Store extends BaseModel {
  @column({ isPrimary: true })
  declare id: string
  
  @column()
  declare user_id: string

  @column()
  declare name: string 

  @column()
  declare title: string

  @column()
  declare description: string

  @column()
  declare slug : string; // Identifiant unique textuel, ex: 'elegance-v2', 'minimalist-dark'

 @column({
    prepare(value) {
      return JSON.stringify(value);
    },
  })
  declare logo: string[]

 @column({
    prepare(value) {
      return JSON.stringify(value);
    },
  })
  declare cover_image: string[]

  @column({
    prepare(value) {
      return JSON.stringify(value);
    },
  })
  declare domain_names: string[]
  
  @column()
  declare current_theme_id: string|null
    
  @column()
  declare current_api_id : string | null

  @column.dateTime({})
  declare expire_at: DateTime

  @column()
  declare disk_storage_limit_gb: number
  
  @column()
  declare is_active: boolean 

  @column({ serializeAs: null }) 
  declare is_running: boolean 

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @beforeCreate()
  public static async generateSlug(store: Store) {
    let baseSlug = limax(store.name, { maintainCase: false })
    store.slug = baseSlug
  }
  
  @beforeSave()
  public static async saveSlug(store: Store) {
    if (store.name) {
      let baseSlug = limax(store.name, { maintainCase: false })
      let slug = baseSlug

      // Vérifier l'unicité du slug
      let count = 0
      while (await Store.findBy('slug', slug)) {
        count++
        if(count > 5) throw new Error('Pas de slug touver pour cette store, changer le nom de la store')
        slug = `${baseSlug}-${count}`
      }
      store.slug = slug
    }
  }


  @belongsTo(() => Api, {
    foreignKey: 'current_api_id',
    localKey: 'id',
  })
  declare currentApi: BelongsTo<typeof Api>

  @belongsTo(() => Theme, {
    foreignKey: 'current_theme_id',
    localKey: 'id',
  })
  declare currentTheme: BelongsTo<typeof Theme>

}