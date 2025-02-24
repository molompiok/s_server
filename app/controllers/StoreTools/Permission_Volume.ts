import { Logs } from "#controllers/Utils/functions"
import env from "#start/env"
import { execa } from "execa"
import fs from "fs/promises"

export { configVolumePermission, removeVolume, deletePermissions }



async function configVolumePermission({ USER_NAME, VOLUME_SOURCE, GROUPE_NAME }: { GROUPE_NAME: string, VOLUME_SOURCE: string, USER_NAME: string }) {
  const logs = new Logs(configVolumePermission);
  /* 🔹 Création de l'utilisateur et des permissions */
  try {
    logs.log(`🔹 Création de l'utilisateur: ${USER_NAME}`)
    await execa('sudo', ['adduser', USER_NAME, '--disabled-password', '--gecos', '""'])

    logs.log(`🔹 Création du groupe: ${GROUPE_NAME}`)
    await execa('sudo', ['groupadd', GROUPE_NAME])

    logs.log(`🔹 Ajout de ${USER_NAME} au groupe ${GROUPE_NAME}`)
    await execa('sudo', ['usermod', '-aG', GROUPE_NAME, USER_NAME])

    const addServerToUserGroup = async () => {
      logs.log(`🔹 Ajout de ${env.get('SERVER_USER')} au groupe ${USER_NAME} ${USER_NAME}`)
      await execa('sudo', ['usermod', '-aG', GROUPE_NAME, env.get('SERVER_USER')])
      await execa('sudo', ['usermod', '-aG', GROUPE_NAME, 'noga'])
    }
    try {
      await addServerToUserGroup()
    } catch (error) {
      logs.log(`🔹 Le user server (${env.get('SERVER_USER')})  n'exist pas`);
    }
    logs.log(`🔹 Creation du VOLUME_SOURCE ${VOLUME_SOURCE}`)
    await execa('sudo', ['mkdir', VOLUME_SOURCE])

    await execa('sudo', ['chown', `${USER_NAME}`, VOLUME_SOURCE])
    await execa('sudo', ['chown', `:${GROUPE_NAME}`, VOLUME_SOURCE])
    await execa('sudo', ['chmod', '775', VOLUME_SOURCE]);
    logs.log(`✅ Volume configurées pour le user : ${USER_NAME}`)
  } catch (error) {
    logs.notifyErrors(`❌ Erreur lors de la configuration des permissions :`, { USER_NAME, VOLUME_SOURCE, GROUPE_NAME }, error);
  }
  return logs
}

async function removeVolume(volumeSource: string) {
  const logs = new Logs(removeVolume)
  try {
    logs.log(`💀 Supression du volume`, volumeSource)
    await execa('sudo', ['rm', '-rf', volumeSource])
    logs.log(`✅ Volume supprimés  avec succès 👍`)
  } catch (error) {
    logs.notifyErrors(`❌ Erreur lors de la suppression du Volume:`, { volumeSource }, error)
  }
  return
}

async function deletePermissions({ groups, users }: { users: string[], groups: string[] }) {
  const logs = new Logs(deletePermissions);
  try {
    logs.log(`💀 Supression des Permission`, { groups, users })
    logs.log(`📜 Creation du fichier de supression `)
    await write_delete_users_sh({ groups, users });
    logs.log(`📜 Supression ...`)
    await execa('sudo', ['chmod', '+x', 'delete_users.sh']);
    console.log('env.get("TPM_DIR")',env.get('TPM_DIR'));
    
    await execa('./delete_users.sh',[],{cwd:env.get('TPM_DIR')});
    logs.log(`✅ Permission supprimés  avec succès 👍`)
  } catch (error) {
    logs.notifyErrors(`❌ Erreur lors de la suppression des permissions :`, { groups, users }, error)
  }
  return logs
}

async function createDir(dir: string) {
  try {
    await fs.stat(dir);
  } catch (error) {
    await fs.mkdir(dir);
  }
}

async function write_delete_users_sh({ groups, users }: { users: string[], groups: string[] }) {

  const tmp = env.get('TPM_DIR') || './tmp';
  const shFile = `${tmp}/delete_users.sh`
  await createDir(tmp)
  await fs.writeFile(shFile,
    ` #!/bin/bash

USERS=(${users.map(u => `"${u}"`).join(' ')})
GROUPS=(${groups.map(g => `"${g}"`).join(' ')})

for user in "\${USERS[@]}"; do
    echo "🗑️ Suppression de l'utilisateur $user..."
    sudo userdel -rf $user
done

for group in "\${GROUPS[@]}"; do
    echo "🗑️ Suppression du groupe $group..."
    sudo groupdel $group
done

echo "✅ Suppression terminée !" `
  );
}