// database/seeders/default_seeder.ts
import { BaseSeeder } from '@adonisjs/lucid/seeders'
import User from '#models/user'
import Store from '#models/store'
import Api from '#models/api'
import Theme from '#models/theme'
import Role from '#models/role'
import { ROLES } from '#models/role'
import hash from '@adonisjs/core/services/hash'
import { DateTime } from 'luxon'
import { v4 as uuidv4 } from 'uuid'
import StoreService from '#services/StoreService'

export default class DefaultSeeder extends BaseSeeder {
  public async run() {
    // 1. Créer ou récupérer le rôle OWNER
    let ownerRole = await Role.findBy('name', ROLES.OWNER)
    if (!ownerRole) {
      ownerRole = await Role.create({
        name: ROLES.OWNER,
        description: 'Propriétaire de boutique(s)',
      })
    }

    // 2. Créer ou récupérer l'utilisateur sablymus@gmail.com
    let user = await User.findBy('email', 'sablymus@gmail.com')
    if (!user) {
      const hashedPassword = await hash.make('okio') // Mot de passe par défaut
      user = await User.create({
        id: uuidv4(),
        email: 'sablymus@gmail.com',
        full_name: 'Sablymus Owner',
        password: hashedPassword,
        status: 'VISIBLE',
        email_verified_at: DateTime.now(),
        photo: [],
      })

      // Assigner le rôle OWNER
      await user.related('roles').attach([ownerRole.id])
      console.log('✅ Utilisateur créé: sablymus@gmail.com')
    } else {
      // S'assurer que l'utilisateur a le rôle OWNER
    }

    // 3. Créer l'API par défaut avec busybox
    let defaultApi = await Api.findDefault()
    if (!defaultApi) {
      // S'assurer qu'il n'y a pas d'autre API par défaut
      await Api.query().where('is_default', true).update({ is_default: false })

      defaultApi = await Api.create({
        id: uuidv4(),
        name: 'API Default',
        description: 'API par défaut avec busybox',
        docker_image_name: 'busybox',
        docker_image_tag: 'latest',
        internal_port: 3334,
        is_default: true,
        source_path: null,
      })
      console.log('✅ API par défaut créée avec busybox (port 3334)')
    } else {
      console.log('✅ API par défaut existante trouvée')
    }

    // 4. Créer le thème par défaut avec busybox
    let defaultTheme = await Theme.findDefault()
    if (!defaultTheme) {
      // S'assurer qu'il n'y a pas d'autre thème par défaut
      await Theme.query().where('is_default', true).update({ is_default: false })

      // Images placeholder inspirées des seeds de s_api (utilisant picsum.photos)
      const previewImages = [
        'https://picsum.photos/800/600?random=1',
        'https://picsum.photos/800/600?random=2',
        'https://picsum.photos/800/600?random=3',
      ]

      defaultTheme = await Theme.create({
        id: uuidv4(),
        name: 'Theme Default',
        description: 'Thème par défaut avec busybox',
        docker_image_name: 'busybox',
        docker_image_tag: 'latest',
        internal_port: 3000,
        is_default: true,
        is_public: true,
        is_active: true,
        is_premium: false,
        price: 0,
        preview_images: previewImages,
        source_path: null,
        creator_id: null,
      })
      console.log('✅ Thème par défaut créé avec busybox (port 3000) avec images')
    } else {
      console.log('✅ Thème par défaut existant trouvé')
    }

    // 5. Créer ou récupérer le store "piou" via StoreService (pour gérer le provisioning)
    let store = await Store.findBy('name', 'piou')
    if (!store) {
      // Images placeholder pour le store (inspirées des seeds de s_api)
      const storeLogo = ['https://picsum.photos/400/400?random=10']
      const storeFavicon = ['https://picsum.photos/64/64?random=11']
      const storeCoverImage = ['https://picsum.photos/1200/600?random=12']

      const result = await StoreService.createAndRunStore({
        name: 'piou',
        title: 'Piou Store',
        description: 'Store par défaut pour sablymus@gmail.com',
        user_id: user.id,
        logo: storeLogo,
        favicon: storeFavicon,
        cover_image: storeCoverImage,
        domain_names: [],
      })

      if (result.success && result.store) {
        store = result.store
        console.log('✅ Store "piou" créé avec provisioning pour sablymus@gmail.com')
        console.log(`   Store ID: ${store.id}`)
        if (result.logs.errors.length > 0) {
          console.warn('⚠️  Avertissements lors de la création:')
          result.logs.errors.forEach((error: any) => {
            console.warn(`   - ${typeof error === 'string' ? error : error.message || JSON.stringify(error)}`)
          })
        }
      } else {
        console.error('❌ Erreur lors de la création du store "piou":')
        result.logs.errors.forEach((error: any) => {
          console.error(`   - ${typeof error === 'string' ? error : error.message || JSON.stringify(error)}`)
        })
        throw new Error('Échec de la création du store via StoreService')
      }
    } else {
      console.log('✅ Store "piou" existant trouvé')
    }

    console.log('✅ Seed terminé avec succès!')
  }
}

