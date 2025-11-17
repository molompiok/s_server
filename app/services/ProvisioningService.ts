import { isProd, Logs } from '../Utils/functions.js'
import { serviceNameSpace } from '../Utils/functions.js'
import env from '#start/env'
import { execa, type ExecaError } from 'execa'
import Store from '#models/store'
import fs from 'fs/promises'

const POSTGRES_SERVICE_NAME = env.get('DB_HOST', 'sublymus_infra_postgres') // swarm service name
const POSTGRES_USER = env.get('DB_USER', 's_server_pg_admin')
const POSTGRES_PORT = env.get('DB_PORT', 5432)
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
    const stderr: any = (error as ExecaError).stderr || [];
    return stderr.includes('already exists') || stderr.includes('existe déjà');
  }
  return false;
}

async function runPgIsReadyInDocker(logs: Logs) {
  let { stdout: containerId } = await execa('docker', [
    'ps',
    '--filter', `name=${POSTGRES_SERVICE_NAME}`,
    '--format', '{{.ID}}'
  ]);

  
  console.log('📢📢📢📢stdout', `-${containerId}-`);
  containerId = isProd?containerId:'postgres-server'
  logs.log(`pg_isready via container: ${containerId}`)

  return execa('docker', [
    'exec', '-i', containerId,
    'pg_isready',
    '-U', POSTGRES_USER,
    '-h', 'localhost',
    '-p', '5433'
  ]);
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
  const { stdout } = await execa('docker', [
    'ps',
    '--filter', `name=${POSTGRES_SERVICE_NAME}`,
    '--format', '{{.ID}}'
  ]);
  console.log('📢📢📢📢stdout', `-${stdout}-`);
  
  let containerId = stdout.trim().split('\n')[0]
  containerId = isProd?containerId:'postgres-server'
  return execa('docker', [
    'exec', '-i', containerId,
    'psql', '-U', POSTGRES_USER,
    '-d', 'postgres',
    ...args
  ])
}

class ProvisioningService {
  async provisionStoreInfrastructure(store: Store) {
    const logs = new Logs(`ProvisioningService.provisionStoreInfrastructure (${store.id})`)
    const { USER_NAME, DB_DATABASE, DB_PASSWORD } = serviceNameSpace(store.id)

    try {
      logs.log(`⚙️ Utilisateur Linux : ${USER_NAME}`)
      if(isProd) await execa('adduser', ['--disabled-password', '--gecos', '""', USER_NAME])
      else  await execa('sudo', ['adduser', '--disabled-password', '--gecos', '""',  USER_NAME])
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
    const volumeBase = env.get('S_API_VOLUME_SOURCE_BASE_IN_S_SERVER', '/volumes/api')
    const volumePath = `${volumeBase}/${store.id}`

    try {
      if (!await ensureDirectoryExists(volumePath)) throw new Error("Création échouée")
      logs.log(`⚙️ Répertoire volume : ${volumePath}`)
      if (isProd) {
        await execa('chown', [`${USER_NAME}:${USER_NAME}`, volumePath])
        await execa('chmod', ['770', volumePath])
      }
      else {
        await execa('sudo', ['chown', `${USER_NAME}:${USER_NAME}`, volumePath])
        await execa('sudo', ['chmod', '770', volumePath])
      }
      logs.log(`✅ Volume OK.`)
    } catch (error) {
      logs.notifyErrors(`❌ Répertoire volume échoué`, {}, error)
    }

    // --- PostgreSQL : pg_isready ---
    // PostgreSQL est nécessaire même en dev pour que s_api puisse fonctionner
    try {
      logs.log(`⚙️ Connexion PostgreSQL (${POSTGRES_SERVICE_NAME}:${POSTGRES_PORT})`)
      await runPgIsReadyInDocker(logs)
      logs.log(`✅ Connexion PostgreSQL OK.`)
    } catch (error) {
      logs.notifyErrors(`❌ PostgreSQL non dispo`, {}, error)
      // En dev, on peut continuer si PostgreSQL n'est pas disponible via Docker, mais on log l'erreur
      if (!isProd) {
        logs.log(`⚠️ Mode dev: PostgreSQL non accessible via Docker, mais on continue quand même.`)
      } else {
        return logs // En prod, on arrête si PostgreSQL n'est pas disponible
      }
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

    return logs.asOk() 
  }

  async deprovisionStoreInfrastructure(store: Store): Promise<boolean> {
    const logs = new Logs(`ProvisioningService.deprovisionStoreInfrastructure (${store.id})`)
    const { USER_NAME, GROUPE_NAME, DB_DATABASE } = serviceNameSpace(store.id)

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
    const volumeBase = env.get('S_API_VOLUME_SOURCE_BASE_IN_S_SERVER', '/volumes/api')
    const volumePath = `${volumeBase}/${store.id}`
    try {
      logs.log(`🗑️ Suppression volume : ${volumePath}`)
      if (isProd) await execa('rm', ['-rf', volumePath])
      else await execa('sudo', ['rm', '-rf', volumePath])
      logs.log(`✅ Volume supprimé.`)
    } catch (error) {
      logs.notifyErrors(`❌ Erreur suppression volume`, {}, error)
      success = false
    }

    // --- Suppression utilisateur Linux ---
    try {
      logs.log(`🗑️ Suppression user Linux : ${USER_NAME}`)
      if (isProd) await execa('userdel', ['-r', USER_NAME])
      else await execa('sudo', ['userdel', '-r', USER_NAME])
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

      if (isProd) await execa('groupdel', [GROUPE_NAME])
      else await execa('sudo', ['groupdel', GROUPE_NAME])
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
