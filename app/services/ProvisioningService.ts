import { Logs } from '../Utils/functions.js'
import { serviceNameSpace } from '../Utils/functions.js'
import env from '#start/env'
import { execa, type ExecaError } from 'execa'
import Store from '#models/store'
import fs from 'fs/promises'

// Récupère l'UID d'un utilisateur Linux
async function getUserId(username: string) {
  try {
    const { stdout } = await execa('id', ['-u', username])
    return parseInt(stdout, 10)
  } catch {
    throw new Error(`❌ Utilisateur ${username} non trouvé.`)
  }
}

// Vérifie si l'erreur contient "already exists"
function isAlreadyExistsError(error: any): boolean {
  if (error instanceof Error && 'stderr' in error) {
    const stderr:any = (error as ExecaError).stderr||[];
    return stderr.includes('already exists') || stderr.includes('existe déjà');
  }
  return false;
}


// Crée un dossier s’il n’existe pas
async function ensureDirectoryExists(path: string): Promise<boolean> {
  try {
    await fs.stat(path)
    return true
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      try {
        await fs.mkdir(path, { recursive: true })
        return true
      } catch {
        return false
      }
    }
    return false
  }
}

// Helper PostgreSQL dans Docker
async function runPsqlInDocker(args: string[], _logs: Logs) {
  const dbAdminUser = env.get('DB_USER', 's_server')
  // const dbAdminPort = '5432'

  return execa('docker', [
    'exec', '-i', 'postgres-server',
    'psql', '-U', dbAdminUser,
    '-d', 'postgres',
    ...args
  ])
}

class ProvisioningService {
  async provisionStoreInfrastructure(store: Store) {
    const logs = new Logs(`ProvisioningService.provisionStoreInfrastructure (${store.id})`)
    const { USER_NAME, DB_DATABASE, DB_PASSWORD } = serviceNameSpace(store.id)
    const dbHost = '0.0.0.0'
    const dbAdminPort = '5432'
   
   

    try {
      logs.log(`⚙️ Utilisateur Linux : ${USER_NAME}`)
      await execa('sudo', ['adduser', '--disabled-password', '--gecos', '""',  USER_NAME])
      logs.log(`✅ Utilisateur ${USER_NAME} OK.`)
      logs.result = (await getUserId(USER_NAME))?.toString()
    } catch (error: any) {
      if (!isAlreadyExistsError(error)) {
        logs.notifyErrors(`❌ Erreur utilisateur Linux`, {}, error)
      } else {
        logs.log(`👍 Utilisateur ${USER_NAME} existe déjà.`)
      }
    }

    // --- Volume ---
    const volumeBase = env.get('S_API_VOLUME_SOURCE', '/volumes/api')
    const volumePath = `${volumeBase}/${store.id}`

    try {
      logs.log(`⚙️ Répertoire volume : ${volumePath}`)
      if (!await ensureDirectoryExists(volumePath)) throw new Error("Création échouée")
      await execa('sudo', ['chown', `${USER_NAME}:${USER_NAME}`, volumePath])
      await execa('sudo', ['chmod', '770', volumePath])
      logs.log(`✅ Volume OK.`)
    } catch (error) {
      logs.notifyErrors(`❌ Répertoire volume échoué`, {}, error)
    }

    // --- PostgreSQL : pg_isready ---
    try {
      logs.log(`⚙️ Connexion PostgreSQL (${dbHost}:${dbAdminPort})`)
      await execa('pg_isready', ['-U', 's_server', '-h', dbHost, '-p', '5400'])
      logs.log(`✅ Connexion PostgreSQL OK.`)
    } catch (error) {
      logs.notifyErrors(`❌ PostgreSQL non dispo`, {}, error)
      return logs
    }

    // --- PostgreSQL : création utilisateur ---
    try {
      logs.log(`⚙️ Création user PG : ${USER_NAME} `)
      await runPsqlInDocker(['-c', `CREATE USER "${USER_NAME}" WITH PASSWORD '${DB_PASSWORD}';`], logs)
      logs.log(`✅ Utilisateur PG OK.`)
    } catch (error: any) {
      if (isAlreadyExistsError(error)) {
        logs.log(`👍 Utilisateur PG existe déjà.`)
      } else {
        logs.notifyErrors(`❌ Erreur création user PG`, {}, error)
      }
    }

    // --- PostgreSQL : création BDD ---
    try {
      logs.log(`⚙️ Création DB PG : ${DB_DATABASE}`)
      await runPsqlInDocker(['-c', `CREATE DATABASE "${DB_DATABASE}" OWNER "${USER_NAME}";`], logs)
      logs.log(`✅ DB PostgreSQL OK.`)
    } catch (error: any) {
      if (isAlreadyExistsError(error)) {
        logs.log(`👍 DB existe déjà.`)
      } else {
        logs.notifyErrors(`❌ Erreur création DB`, {}, error)
      }
    }

    return logs
  }

  async deprovisionStoreInfrastructure(store: Store): Promise<boolean> {
    const logs = new Logs(`ProvisioningService.deprovisionStoreInfrastructure (${store.id})`)
    const { USER_NAME, GROUPE_NAME,  DB_DATABASE } = serviceNameSpace(store.id)
    
    let success = true

    // --- Suppression BDD ---
    try {
      logs.log(`🗑️ Suppression DB : ${DB_DATABASE}`)
      await runPsqlInDocker([
        '-c',
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${DB_DATABASE}';`
      ], logs)
      await runPsqlInDocker(['-c', `DROP DATABASE IF EXISTS "${DB_DATABASE}";`], logs)
      logs.log(`✅ DB supprimée.`)
    } catch (error) {
      logs.notifyErrors(`❌ Erreur suppression DB`, {}, error)
      success = false
    }

    // --- Suppression utilisateur PG ---
    try {
      logs.log(`🗑️ Suppression user PG : ${USER_NAME}`)
      await runPsqlInDocker(['-c', `DROP USER IF EXISTS "${USER_NAME}";`], logs)
      logs.log(`✅ User PG supprimé.`)
    } catch (error) {
      logs.notifyErrors(`❌ Erreur suppression user PG`, {}, error)
      success = false
    }

    // --- Suppression dossier ---
    const volumeBase = env.get('S_API_VOLUME_SOURCE', '/volumes/api')
    const volumePath = `${volumeBase}/${store.id}`
    try {
      logs.log(`🗑️ Suppression volume : ${volumePath}`)
      await execa('sudo', ['rm', '-rf', volumePath])
      logs.log(`✅ Volume supprimé.`)
    } catch (error) {
      logs.notifyErrors(`❌ Erreur suppression volume`, {}, error)
      success = false
    }

    // --- Suppression utilisateur Linux ---
    try {
      logs.log(`🗑️ Suppression user Linux : ${USER_NAME}`)
      await execa('sudo', ['userdel', '-rf', USER_NAME])
      logs.log(`✅ User supprimé.`)
    } catch (error: any) {
      const stderr = error?.stderr || ''
      if (!stderr.includes('does not exist')) {
        logs.notifyErrors(`❌ Erreur suppression user Linux`, {}, error)
        success = false
      }
    }

    // --- Suppression groupe Linux ---
    try {
      logs.log(`🗑️ Suppression groupe Linux : ${GROUPE_NAME}`)
      await execa('sudo', ['groupdel', GROUPE_NAME])
      logs.log(`✅ Groupe supprimé.`)
    } catch (error: any) {
      const stderr = error?.stderr || ''
      if (!stderr.includes('does not exist') && !stderr.includes('is not empty')) {
        logs.notifyErrors(`❌ Erreur suppression groupe Linux`, {}, error)
        success = false
      }
    }

    return success
  }
}

export default new ProvisioningService()
