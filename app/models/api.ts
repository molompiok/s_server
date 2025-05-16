// app/models/api.ts

import { DateTime } from 'luxon'
import limax from 'limax';
import { BaseModel, beforeCreate, beforeSave, column } from '@adonisjs/lucid/orm'
import { Logs } from '../Utils/functions.js';

export default class Api extends BaseModel {

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare name: string

  @column()
  declare slug: string;

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
  public static async saveSlug(instance: Api) {

    if (instance.$dirty.name || !instance.$isPersisted) { // $dirty.name vérifie si 'name' a changé, !$persisted si c'est une création
      const baseSlug = limax(instance.name, { maintainCase: false })
      let slug = baseSlug
      let count = 0

      while (true) {
        const query = Api.query().where('slug', slug)

        // Si l'instance a déjà un ID (c'est une mise à jour), on l'exclut de la recherche de conflit
        if (instance.id) {
          query.whereNot('id', instance.id)
        }

        const conflict = await query.first()

        if (!conflict) {
          // Aucun conflit trouvé (ou le seul conflit était l'instance elle-même), on peut utiliser ce slug
          break
        }
        count++
        slug = `${baseSlug}-${count}`

        if (count > 100) {
          const logs = new Logs('saveSlug(instance: Api)');
          logs.logErrors(`Impossible de générer un slug unique pour ${instance.name} après 100 tentatives.`);
          throw new Error(`Échec de la génération du slug pour ${instance.name}. Vérifiez les conflits.`);
        }
      }
      instance.slug = slug
    }
  }

  get fullImageName(): string {
    return `${this.docker_image_name}:${this.docker_image_tag}`;
  }
  static async findDefault(): Promise<Api | null> {
    return await Api.query().where('is_default', true).first();
  }
}