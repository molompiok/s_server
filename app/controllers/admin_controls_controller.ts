import type { HttpContext } from '@adonisjs/core/http'
import { removeAllDockerContainer, runAllActiveStore } from './StoreTools/Docker.js';
import { Logs } from './Utils/functions.js';


//TODO une ia qui vas tous gerer aurimatiquement;

export default class AdminControlsController {
    async init_server({ request, response, auth }: HttpContext) {
        const user = await auth.authenticate();
        const { } = request.body();
        if (user) {
            //TODO Adimin
        }
        const logs = new Logs(this.init_server);
        logs.merge(await removeAllDockerContainer('ALL'));
        logs.merge(await runAllActiveStore({
            PORT: '3334',
            DOCKER_IMAGE: 's_api:v1.0.0', //TODO getCurrentApiVerssion();
        }));

        return response.ok({ message: logs.ok ? 'in runing' : 'check errors', logs })
    }
    async api_do_not_listen({request,response}:HttpContext) {
        const store_id = request.param('id');
        //TODO verifier si le docker est lancee
        // tester le requette sur son port
        // a la moindre error lancer un nouveau docker => updateDockerInstance()
        // envoyer le nouveau lien de l'api au client 

        // l'api est stoper, le client fait une requette, le theme recoit la requette, le theme fait appele a l'api, l'api ne repons pas, le theme demand au server, 
            // si l'api est sencee tourner, le server le relance, le test, renvoie le nouveau port et host, dans le cas contraire, le theme affiche une page de maintenace. 
            // si l'api est stoper pour innactiviter ou que le store n'existe pas, le theme affiche une page de maintenace. 
            // si l'api est lui meme theme,
        //quand un api plante la relaner, signaler. 


    
        return response.ok({
            host:'0.0.0.0',
            port:'1255'
        })
    }
}