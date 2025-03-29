import { BaseModel, SnakeCaseNamingStrategy } from '@adonisjs/lucid/orm'

BaseModel.namingStrategy = new SnakeCaseNamingStrategy()
