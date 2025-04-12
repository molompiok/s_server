import { Logs } from "../Utils/functions.js"
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
  } catch (error) {
    if(error.stderr.includes('already exists')){
      logs.log(`👍 L'utilisateur(${USER_NAME}) existe deja`);
    }else{
      return logs.notifyErrors(`❌ Error lors de l'ajout de l'utilisateur`,{ USER_NAME, VOLUME_SOURCE, GROUPE_NAME },logs)
    }
  }
  
  try {
    logs.log(`🔹 Création du groupe: ${GROUPE_NAME}`)
    await execa('sudo', ['groupadd', GROUPE_NAME])
  } catch (error) {
    if(error.stderr.includes('already exists')){
      logs.log(`👍 Le Group(${USER_NAME}) existe deja`);
    }else{
      return logs.notifyErrors(`❌ Error lors de l'ajout de l'utilisateur`,{ USER_NAME, VOLUME_SOURCE, GROUPE_NAME },logs)
    }
  }
  
  try {

    logs.log(`🔹 Ajout de ${USER_NAME} au groupe ${GROUPE_NAME}`)
    await execa('sudo', ['usermod', '-aG', GROUPE_NAME, USER_NAME])
    logs.log(`🔹 Ajout de ${env.get('SERVER_USER')} au groupe ${USER_NAME} `)
    await execa('sudo', ['usermod', '-aG', GROUPE_NAME, env.get('SERVER_USER')])
  } catch (error) {
    logs.log(`❌ Erreur l'ajout du user(${USER_NAME}) au group(${GROUPE_NAME})`);
  }

  try {
    logs.log(`🔹 Creation du VOLUME_SOURCE ${VOLUME_SOURCE}`)
    await execa('sudo', ['mkdir', VOLUME_SOURCE])
  } catch (error) {
    if(error.stderr.includes('File exists')){
      logs.log(`👍 Le VOLUME(${VOLUME_SOURCE}) existe deja`);
    }else{
      logs.log(`❌ Erreur lors de la creation du VOLUME(${VOLUME_SOURCE})`);
    }
  }
  try {
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
  logs.log(`💀 Supression des Permission`, { groups, users })
  try {
    logs.log(`📜 Creation du fichier de supression `)
    await write_delete_users_sh({ 
      // users:await getUsersId(users),
      users,
      // groups:await getGroupsId(groups) 
      groups 
    });
    
  } catch (error) {
    logs.notifyErrors(`❌ Erreur lors de 'ecriture du fichier de supression:`, { groups, users }, error)
  } 
  try {
    logs.log(`📜 Supression ...`)
    // await execa('sudo', ['usermod', '-rG', GROUPE_NAME, env.get('SERVER_USER')])
    await execa('bash',['/home/noga/s_server/tmp/delete_users.sh']);
    
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
// async function getUsersId(users:string[]) {
//   const ids = [];
//   for (const user of users) {
//     let id=user;
//     let std='';
//     try {
//       const  {stdout} = await execa('id',[user]) 
//       std = stdout;
//       id = stdout.split(' ')[0].split('=')[1].split('(')[0]
//       console.log({id})
//       ids.push(id)
//     } catch (error) {
//       ids.push(user);
//     }
//     console.log({user,id,std})
//   }
//   return ids
// }
// async function getGroupsId(groups:string[]) {
//   const ids = [];
//   for (const group of groups) {
//     let id = group;
//     let std='';
//     try {
//       const  {stdout} = await execa('getent',['group',group]) 
//       std = stdout
//       id = stdout.split(':')[2];
//       console.log({group,id,stdout})
//       ids.push(id)
//     } catch (error) {
//       ids.push(group)
//     }
//     console.log({group,id,std})
//   }
//   return ids
// }
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