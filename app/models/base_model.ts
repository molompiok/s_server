//app/models/base_model.ts
import { BaseModel as LucidBaseModel } from '@adonisjs/lucid/orm'

export default class BaseModel extends LucidBaseModel {
  toJSON() {
    const data = super.toJSON()
    return this.cleanObject(data)
  }

  private cleanObject(obj: any): any {
    if (Array.isArray(obj)) {
      return obj.map((item) => this.cleanObject(item))
    } else if (typeof obj === 'object' && obj !== null) {
      return Object.fromEntries(
        Object.entries(obj)
          .filter(([_, value]) => value !== null)
          .map(([key, value]) => [key, this.cleanObject(value)])
      )
    }
    return obj
  }
}
