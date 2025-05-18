import pg from 'pg';



const { Client } = pg;

// Fonction principale
async function testConnection() {
  console.log('Attempting to connect to PostgreSQL...');

  const {
    DB_HOST,
    DB_PORT = '5432',
    DB_USER,
    DB_PASSWORD,
    DB_DATABASE
  } = process.env;

  console.log('DB_HOST:', DB_HOST);
  console.log('DB_PORT:', DB_PORT);
  console.log('DB_USER:', DB_USER);
  console.log('DB_DATABASE:', DB_DATABASE);

  // ⚠️ Ne jamais logger DB_PASSWORD en production

  // Vérifie que toutes les variables nécessaires sont bien présentes
  if (!DB_HOST || !DB_USER || !DB_PASSWORD || !DB_DATABASE) {
    console.error('❌ Missing one or more required DB environment variables.');
    process.exit(1);
  }

  const client = new Client({
    host: DB_HOST,
    port: parseInt(DB_PORT, 10),
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_DATABASE,
    // ssl: { rejectUnauthorized: false } // si besoin en prod ou env externe
  });

  try {
    await client.connect();
    console.log('✅ Successfully connected to PostgreSQL!');
    const result = await client.query('SELECT NOW()');
    console.log('🕒 Current time from DB:', result.rows[0].now);
  } catch (error) {
    console.error('❌ Connection error:', error);
    process.exit(1);
  } finally {
    await client.end();
    console.log('🔌 Connection closed.');
  }
}

testConnection().catch((err) => {
  console.error('❌ Unexpected error:', err);
  process.exit(1);
});
