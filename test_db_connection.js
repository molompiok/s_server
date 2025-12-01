// Script de test de connexion à PostgreSQL
import pg from 'pg'
const { Client } = pg

const config = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5433'),
  user: process.env.DB_USER || 's_server_pg_admin',
  password: process.env.DB_PASSWORD || 'sublymus_db_password_2024',
  database: process.env.DB_DATABASE || 's_server_main_db',
}

console.log('🔍 Test de connexion à PostgreSQL...')
console.log('Configuration:')
console.log(`  DB_HOST: ${config.host}`)
console.log(`  DB_PORT: ${config.port}`)
console.log(`  DB_USER: ${config.user}`)
console.log(`  DB_DATABASE: ${config.database}`)
console.log('')

const client = new Client(config)

try {
  await client.connect()
  console.log('✅ Connexion réussie!')
  
  const result = await client.query('SELECT version(), current_database(), current_user')
  console.log('📊 Informations:')
  console.log(`  Version: ${result.rows[0].version.split(',')[0]}`)
  console.log(`  Base de données: ${result.rows[0].current_database}`)
  console.log(`  Utilisateur: ${result.rows[0].current_user}`)
  
  await client.end()
  process.exit(0)
} catch (error) {
  console.error('❌ Erreur de connexion:')
  console.error(`  ${error.message}`)
  console.error('')
  console.error('💡 Vérifiez que:')
  console.error('  1. Le conteneur PostgreSQL est démarré: docker ps | grep postgres')
  console.error('  2. Le port est correct (5433 pour accès local)')
  console.error('  3. Les credentials sont corrects')
  process.exit(1)
}

