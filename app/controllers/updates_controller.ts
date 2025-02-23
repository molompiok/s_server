import type { HttpContext } from '@adonisjs/core/http'
import { Logs } from './Utils/functions.js'
import { execa } from 'execa';
// import { runNewDockerInstance } from './StoreTools/Docker.js';

async function buildDockeInstance(image_dir:string) {
  //TODO gerer le versioning a recuperer dans le image_dir/Dockerfile (ENV NAME=IMAGE_NAME VERSION=IMAGE_VERSION )
  const image_name = '';
  const image_version= '';

  const logs = new Logs(buildDockeInstance);
  try {
    logs.log('🚀 Initialisation Du Build Docker ...');
    await execa('sudo', ['docker', 'build', '-t', `${image_name}:${image_version}`], { cwd: image_dir });
    logs.log('✅ 🏗️ Build Docker Image Terminer');
    //TODO Test Docker image in terminal
  } catch (error) {
    logs.notifyErrors(`❌ Erreur lors du build Docker`, { image_name, image_version, image_dir }, error)
  }
  return logs;
}



export default class UpdatesController {
  async handle({ request, response }: HttpContext) {
    const { repo } = request.body()
    const logs = new Logs(this.handle);

    if (repo === 'sublymus_api') {
      console.log(`🔔 Mise à jour détectée sur ${repo} !`)
      logs.merge(await buildDockeInstance('API'))
      return response.ok({ message: 'Mise à jour reçue !' })
    }

    return response.badRequest({ message: 'Repo non reconnu' })
  }
}
