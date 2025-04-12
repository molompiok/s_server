import { Logs } from "../Utils/functions.js"
import { execa } from "execa"

export { deleteDatabase, createDatabase }


const DB_HOST = 'localhost'


async function deleteDatabase(DB_DATABASE: string) {
  const logs = new Logs(deleteDatabase);
  try {
    logs.log(`🔍 Vérification de PostgreSQL...`)
    await execa('pg_isready') // Vérifie que PostgreSQL est en ligne
    logs.log(`✅ PostgreSQL est disponible.`)

    logs.log(`🗑 Suppression de la base de données '${DB_DATABASE}'...`)
    await execa('sudo', ['-u', 'postgres', 'psql', '-c', `DROP DATABASE IF EXISTS ${DB_DATABASE};`])

    logs.log(`✅ Base de données '${DB_DATABASE}' supprimée avec succès.`)
  } catch (error) {
    logs.notifyErrors(`❌ Erreur lors de la suppression :`, { DB_DATABASE }, error)
  }
  return logs
}


async function createDatabase({ DB_DATABASE, DB_PASSWORD, USER_NAME }: { DB_DATABASE: string, USER_NAME: string, DB_PASSWORD: string }) {
  const logs = new Logs(createDatabase);
  try {
    logs.log(`🔍 Vérification de PostgreSQL...`)
    await execa('pg_isready', ['-h', DB_HOST])
    logs.log(`✅ PostgreSQL est disponible.`)
  } catch (error) {
    return logs.notifyErrors('Postgres N\'est pas disponible sur la machine',{ DB_DATABASE, DB_PASSWORD, USER_NAME },error);
  }
  try {
    logs.log(`📌 Création de l'utilisateur PostgreSQL : ${USER_NAME}`)
    await execa('sudo', ['-u', 'postgres', 'psql', '-c', `CREATE USER ${USER_NAME} WITH PASSWORD '${DB_PASSWORD}';`])
  } catch (error) {
    if(error.stderr.includes('already exists')){
      logs.log(`👍 Le User(${USER_NAME}) existe deja`);
    }else 
      return logs.notifyErrors(`❌ Erreur lors de la creation du user(${USER_NAME}) dans la db`)
  }

  try {
    logs.log(`📌 Création de la base de données : ${DB_DATABASE}`)
    await execa('sudo', ['-u', 'postgres', 'psql', '-c', `CREATE DATABASE ${DB_DATABASE} OWNER ${USER_NAME};`])
  } catch (error) {
    if(error.stderr.includes('already exists')){
      logs.log(`👍 La DataBase (${DB_DATABASE}) existe deja`);
    }else 
      return logs.notifyErrors(`❌ Erreur lors de la creation de la database(${DB_DATABASE}) dans la db`)
  }

  try {
   
    logs.log(`📌 Attribution des permissions`)
    await execa('sudo', ['-u', 'postgres', 'psql', '-c', `GRANT ALL PRIVILEGES ON DATABASE ${DB_DATABASE} TO ${USER_NAME};`])

    logs.log(`✅ Base de données PostgreSQL '${DB_DATABASE}' créée avec succès.`)
  } catch (error) {
    logs.notifyErrors(`❌ Erreur lors de l'attribusion des permissions`, { DB_DATABASE, DB_PASSWORD, USER_NAME }, error)
  }
  return logs
}
