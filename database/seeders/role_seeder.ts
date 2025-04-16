// database/seeders/role_seeder.ts
import Role from '#models/role'
import { BaseSeeder } from '@adonisjs/lucid/seeders'
import { ROLES } from '#models/role' // Importe tes constantes

export default class RoleSeeder extends BaseSeeder {
    public async run () {
        await Role.createMany([
             { name: ROLES.OWNER, description: 'Propriétaire de boutique(s)' },
             { name: ROLES.ADMIN, description: 'Administrateur de la plateforme' },
             { name: ROLES.MODERATOR, description: 'Modérateur de la plateforme' },
             { name: ROLES.CREATOR, description: 'Créateur de thèmes' },
             { name: ROLES.AFFILIATE, description: 'Affilié marketing' },
        ])
    }
}