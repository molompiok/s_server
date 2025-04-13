// app/services/ProvisioningService.ts

import { Logs } from '../controllers2/Utils/functions.js' // Gardons Logs
import { serviceNameSpace } from '../controllers2/Utils/functions.js'
import env from '#start/env'
import { execa, type ExecaError } from 'execa' // On aura toujours besoin d'execa pour les commandes système
import Store from '#models/store'
import fs from 'fs/promises'

// Helper pour vérifier si une erreur execa est "already exists" ou similaire
function isAlreadyExistsError(error: any): boolean {
  if (error instanceof Error && 'stderr' in error) {
    const stderr:any = (error as ExecaError).stderr||[];
    return stderr.includes('already exists') || stderr.includes('existe déjà');
  }
  return false;
}

// Helper pour créer un répertoire s'il n'existe pas
async function ensureDirectoryExists(path: string): Promise<boolean> {
  try {
    await fs.stat(path);
    return true; // Existe déjà
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      try {
        await fs.mkdir(path, { recursive: true }); // Créer récursivement
        return true; // Créé avec succès
      } catch (mkdirError) {
        return false; // Échec de la création
      }
    }
    return false; // Autre erreur stat
  }
}

class ProvisioningService {

  /**
   * Provisionne l'infrastructure système pour un store :
   * User Linux, Group Linux, Volume Directory, Base de données PG, User PG.
   * Conçu pour être idempotent.
   *
   * @param store L'objet Store pour lequel provisionner.
   * @returns boolean Indique si le provisioning a réussi globalement.
   */
  async provisionStoreInfrastructure(store: Store): Promise<boolean> {
    const logs = new Logs(`ProvisioningService.provisionStoreInfrastructure (${store.id})`);
    const { USER_NAME, GROUPE_NAME, DB_DATABASE, DB_PASSWORD } = serviceNameSpace(store.id);
 
    let success = true;

    // --- 1. User et Groupe Linux ---
    try {
      logs.log(`⚙️ Vérification/Création Groupe Linux: ${GROUPE_NAME}...`);
      await execa('sudo', ['groupadd', GROUPE_NAME]);
      logs.log(`✅ Groupe Linux ${GROUPE_NAME} OK.`);
    } catch (error: any) {
      if (!isAlreadyExistsError(error)) {
        logs.notifyErrors(`❌ Erreur lors de la création du groupe ${GROUPE_NAME}`, {}, error);
        success = false;
      } else {
         logs.log(`👍 Groupe Linux ${GROUPE_NAME} existe déjà.`);
      }
    }

    try {
      logs.log(`⚙️ Vérification/Création User Linux: ${USER_NAME}...`);
      // --disabled-password crée un user sans mot de passe utilisable pour login direct
      // --gecos "" évite les questions interactives
      // -g spécifie le groupe principal lors de la création
      await execa('sudo', ['adduser', '--disabled-password', '--gecos', '""', '--ingroup', GROUPE_NAME, USER_NAME]);
      logs.log(`✅ User Linux ${USER_NAME} OK (dans groupe ${GROUPE_NAME}).`);
    } catch (error: any) {
      if (!isAlreadyExistsError(error)) {
        logs.notifyErrors(`❌ Erreur lors de la création de l'utilisateur ${USER_NAME}`, {}, error);
        success = false;
      } else {
         logs.log(`👍 User Linux ${USER_NAME} existe déjà.`);
         //TODO Assurer qu'il est bien dans le groupe principal (si adduser seul ne suffit pas)
         try {
             await execa('sudo', ['usermod', '-g', GROUPE_NAME, USER_NAME]);
             logs.log(`   -> Appartenance principale au groupe ${GROUPE_NAME} vérifiée.`);
         } catch(usermodError) {
             logs.notifyErrors(`   -> ⚠️ Erreur vérification groupe principal ${USER_NAME}`, {}, usermodError);
         }
      }
    }

    // On ne met PAS userRunningApp ('opus-ub') dans le groupe g_STOREID

    // --- 2. Répertoire Volume ---
    const sApiVolumeBase = env.get('S_API_VOLUME_SOURCE', '/volumes/api');
    const storeVolumePath = `${sApiVolumeBase}/${store.id}`; // Le chemin complet du volume pour CE store
    
    try {
        logs.log(`⚙️ Vérification/Création Répertoire Volume: ${storeVolumePath}...`);
        const dirExists = await ensureDirectoryExists(storeVolumePath);
        if (!dirExists) throw new Error("Échec de la création du répertoire");

        logs.log(`   -> Attribution propriétaire ${USER_NAME}...`);
        await execa('sudo', ['chown', `${USER_NAME}:${GROUPE_NAME}`, storeVolumePath]);
        logs.log(`   -> Attribution permissions 770...`); // 770: User(rwx), Group(rwx), Other(---)
        await execa('sudo', ['chmod', '770', storeVolumePath]);
        logs.log(`✅ Répertoire Volume ${storeVolumePath} OK.`);
    } catch(error) {
         logs.notifyErrors(`❌ Erreur lors de la configuration du répertoire Volume ${storeVolumePath}`, {}, error);
         success = false;
    }

    // --- 3. Base de données et User PostgreSQL ---
    const dbHost = env.get('DB_HOST', '127.0.0.1');
    const dbAdminUser = 'postgres'; // Ou l'utilisateur ayant les droits de créer des DB/Users PG

    try {
        logs.log(`⚙️ Vérification connexion PostgreSQL sur ${dbHost}...`);
        await execa('pg_isready', ['-U', dbAdminUser]); // Tester avec l'utilisateur admin
        logs.log(`✅ Connexion PostgreSQL OK.`);
    } catch(error) {
         logs.notifyErrors('❌ PostgreSQL n\'est pas disponible ou accessible', {host: dbHost, user: dbAdminUser}, error);
        return false; // Erreur bloquante
    }

    try {
        logs.log(`⚙️ Vérification/Création User PostgreSQL: ${USER_NAME}...`);
        // TODO Attention à l'injection SQL ! Utiliser des requêtes paramétrées si possible via un client PG.
        // Avec execa, il faut être prudent avec les guillemets. '' pour le mot de passe.
        await execa('sudo', ['-u', dbAdminUser, 'psql', '-c', `CREATE USER "${USER_NAME}" WITH PASSWORD '${DB_PASSWORD}';`]);
        logs.log(`✅ User PostgreSQL ${USER_NAME} OK.`);
    } catch (error: any) {
        if (error.stderr?.toLowerCase().includes('already exists')) {
             logs.log(`👍 User PostgreSQL ${USER_NAME} existe déjà.`);
             // TODO: Mettre à jour le mot de passe ? ALTER USER ... PASSWORD ...
        } else {
            logs.notifyErrors(`❌ Erreur création User PostgreSQL ${USER_NAME}`, {}, error);
            success = false;
        }
    }

    try {
        logs.log(`⚙️ Vérification/Création Database PostgreSQL: ${DB_DATABASE}...`);
        // Crée la DB et assigne le propriétaire créé juste avant
        await execa('sudo', ['-u', dbAdminUser, 'psql', '-c', `CREATE DATABASE "${DB_DATABASE}" OWNER "${USER_NAME}";`]);
        logs.log(`✅ Database PostgreSQL ${DB_DATABASE} OK.`);
    } catch (error: any) {
        if (error.stderr?.toLowerCase().includes('already exists')) {
             logs.log(`👍 Database PostgreSQL ${DB_DATABASE} existe déjà.`);
             // TODO: Vérifier/corriger le propriétaire ? ALTER DATABASE ... OWNER TO ...
        } else {
             logs.notifyErrors(`❌ Erreur création Database PostgreSQL ${DB_DATABASE}`, {}, error);
             success = false;
        }
    }

    // Pas besoin de GRANT ALL PRIVILEGES si l'utilisateur est OWNER de la DB. Il a déjà tous les droits.

    return success;
  }


  /**
   * Déprovisionne l'infrastructure système pour un store :
   * User Linux, Group Linux, Volume Directory, Base de données PG, User PG.
   * Tente de nettoyer même si des étapes échouent.
   *
   * @param store L'objet Store pour lequel déprovisionner.
   * @returns boolean Indique si toutes les étapes de nettoyage ont (apparemment) réussi.
   */
  async deprovisionStoreInfrastructure(store: Store): Promise<boolean> {
    const logs = new Logs(`ProvisioningService.deprovisionStoreInfrastructure (${store.id})`);
    const { USER_NAME, GROUPE_NAME, DB_DATABASE } = serviceNameSpace(store.id);
    const dbHost = env.get('DB_HOST', '127.0.0.1');
    const dbAdminUser = 'postgres';
    let success = true;

    const sApiVolumeBase = env.get('S_API_VOLUME_SOURCE', '/volumes/api');
    const storeVolumePath = `${sApiVolumeBase}/${store.id}`; // Cohérence avec provision

    // --- 1. Base de données et User PostgreSQL ---
    // Il faut DROPER la DB avant de DROPER l'utilisateur propriétaire
    try {
        logs.log(`🗑️ Suppression Database PostgreSQL: ${DB_DATABASE}...`);
        // S'assurer qu'aucune connexion n'est active est crucial !
        // On peut forcer la déconnexion des utilisateurs
         await execa('sudo', ['-u', dbAdminUser, 'psql', '-c', `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${DB_DATABASE}';`], { reject: false }); // Tente de terminer les backends, ignore l'erreur si la DB n'existe pas
        await execa('sudo', ['-u', dbAdminUser, 'psql', '-c', `DROP DATABASE IF EXISTS "${DB_DATABASE}";`]);
        logs.log(`✅ Database PostgreSQL ${DB_DATABASE} supprimée (si existante).`);
    } catch (error: any) {
        logs.notifyErrors(`❌ Erreur suppression Database PostgreSQL ${DB_DATABASE}`, {}, error);
        success = false; // Peut empêcher la suppression de l'user PG
    }

    try {
        logs.log(`🗑️ Suppression User PostgreSQL: ${USER_NAME}...`);
        await execa('sudo', ['-u', dbAdminUser, 'psql', '-c', `DROP USER IF EXISTS "${USER_NAME}";`]);
        logs.log(`✅ User PostgreSQL ${USER_NAME} supprimé (si existant).`);
    } catch (error: any) {
        logs.notifyErrors(`❌ Erreur suppression User PostgreSQL ${USER_NAME}`, {}, error);
        success = false;
    }

    // --- 2. Répertoire Volume ---
    try {
        logs.log(`🗑️ Suppression Répertoire Volume: ${storeVolumePath}...`);
        await execa('sudo', ['rm', '-rf', storeVolumePath]);
        logs.log(`✅ Répertoire Volume ${storeVolumePath} supprimé.`);
    } catch (error) {
        logs.notifyErrors(`❌ Erreur suppression Répertoire Volume ${storeVolumePath}`, {}, error);
        success = false;
    }

    // --- 3. User et Groupe Linux ---
    // Supprimer l'utilisateur d'abord, puis le groupe (s'il est vide)
    try {
        logs.log(`🗑️ Suppression User Linux: ${USER_NAME}...`);
        // -r supprime aussi le home directory (pas créé ici, mais bonne pratique)
        // -f force même si l'utilisateur est connecté (peu probable)
        await execa('sudo', ['userdel', '-rf', USER_NAME]);
        logs.log(`✅ User Linux ${USER_NAME} supprimé.`);
    } catch (error) {
         // Peut échouer si l'user n'existe pas, c'est ok
        if (! (error instanceof Error && 'stderr' in error && (error as any).stderr?.includes('does not exist'))) {
            logs.notifyErrors(`❌ Erreur suppression User Linux ${USER_NAME}`, {}, error);
            success = false;
        }
    }

    try {
        logs.log(`🗑️ Suppression Groupe Linux: ${GROUPE_NAME}...`);
        // Ne supprime que si le groupe est vide
        await execa('sudo', ['groupdel', GROUPE_NAME]);
        logs.log(`✅ Groupe Linux ${GROUPE_NAME} supprimé (s'il était vide).`);
    } catch (error) {
         // Peut échouer si le groupe n'existe pas ou n'est pas vide, c'est ok dans ce flux
        if (! (error instanceof Error && 'stderr' in error && ((error as any).stderr?.includes('does not exist') || (error as any).stderr?.includes('is not empty')) )) {
            logs.notifyErrors(`❌ Erreur suppression Groupe Linux ${GROUPE_NAME}`, {}, error);
            success = false;
        }
    }

    // Pas besoin d'utiliser delete_users.sh, on le fait directement.

    return success;
  }

}

// Exporte une instance unique
export default new ProvisioningService()