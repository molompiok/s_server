import { BaseSeeder } from '@adonisjs/lucid/seeders'
import Api from '#models/api'
import Theme from '#models/theme'
import env from '#start/env'

export default class extends BaseSeeder {
  async run() {
    // Déterminer si on est en local ou en production
    const isLocal = env.get('NODE_ENV') === 'development'

    console.log(`🔧 Environment: ${isLocal ? 'LOCAL (development)' : 'PRODUCTION'}`)

    // ==========================================
    // SEED DEFAULT API
    // ==========================================

    const apiImageName = isLocal ? 'busybox' : 'sublymus/s_api'
    const apiImageTag = isLocal ? 'latest' : 'latest'

    const defaultApi = await Api.updateOrCreate(
      { slug: 'default-api' },
      {
        name: 'API Boutique par Défaut',
        description: 'API par défaut pour les nouvelles boutiques Sublymus',
        docker_image_name: apiImageName,
        docker_image_tag: apiImageTag,
        internal_port: 3334,
        source_path: isLocal ? null : 'https://github.com/sublymus/s_api',
        is_default: true,
      }
    )

    console.log(`✅ Default API created/updated:`)
    console.log(`   - Name: ${defaultApi.name}`)
    console.log(`   - Image: ${defaultApi.docker_image_name}:${defaultApi.docker_image_tag}`)
    console.log(`   - Port: ${defaultApi.internal_port}`)
    console.log(`   - Is Default: ${defaultApi.is_default}`)

    // ==========================================
    // SEED DEFAULT THEME
    // ==========================================

    const themeImageName = isLocal ? 'busybox' : 'sublymus/theme_1'
    const themeImageTag = isLocal ? 'latest' : 'latest'

    const defaultTheme = await Theme.updateOrCreate(
      { slug: 'default-theme' },
      {
        name: 'Thème par Défaut',
        description: 'Thème moderne et responsive pour les boutiques en ligne',
        preview_images: [
          'https://fastly.picsum.photos/id/52/400/400.jpg?hmac=MkGJ0zl63xMykh2ZyLH1zU8L7KfV3UuSNe1XGs3Xx1M',
          'https://fastly.picsum.photos/id/52/400/400.jpg?hmac=MkGJ0zl63xMykh2ZyLH1zU8L7KfV3UuSNe1XGs3Xx1M',
        ],
        docker_image_name: themeImageName,
        docker_image_tag: themeImageTag,
        internal_port: 3000,
        source_path: isLocal ? null : 'https://github.com/sublymus/theme_1',
        is_public: true,
        is_active: true,
        is_running: false,
        is_default: true,
        is_premium: false,
        price: 0,
        creator_id: null, // Thème officiel Sublymus
      }
    )

    console.log(`✅ Default Theme created/updated:`)
    console.log(`   - Name: ${defaultTheme.name}`)
    console.log(`   - Image: ${defaultTheme.docker_image_name}:${defaultTheme.docker_image_tag}`)
    console.log(`   - Port: ${defaultTheme.internal_port}`)
    console.log(`   - Is Default: ${defaultTheme.is_default}`)
    console.log(`   - Is Public: ${defaultTheme.is_public}`)
    console.log(`   - Price: ${defaultTheme.price} XOF`)

    // ==========================================
    // S'assurer qu'il n'y a qu'un seul default
    // ==========================================

    // Désactiver is_default pour toutes les autres APIs
    await Api.query()
      .whereNot('id', defaultApi.id)
      .where('is_default', true)
      .update({ is_default: false })

    // Désactiver is_default pour tous les autres thèmes
    await Theme.query()
      .whereNot('id', defaultTheme.id)
      .where('is_default', true)
      .update({ is_default: false })

    console.log(`\n✅ Default API and Theme seeded successfully!`)
    console.log(`📦 API Image: ${apiImageName}:${apiImageTag}`)
    console.log(`🎨 Theme Image: ${themeImageName}:${themeImageTag}`)
  }
}
