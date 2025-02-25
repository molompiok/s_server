import type { HttpContext } from '@adonisjs/core/http'
import { removeAllDockerContainer, runAllActiveStore } from './StoreTools/Docker.js';
import { Logs } from './Utils/functions.js';

export default class AdminControlsController {
    async init_server({request,response,auth}:HttpContext){
        const user = await auth.authenticate();
        const {} = request.body();
        if(user){
            //TODO Adimin
        }
        const logs = new Logs(this.init_server);
        logs.merge(await removeAllDockerContainer('ALL'))
        logs.merge(await runAllActiveStore({
            PORT:'3334',
            DOCKER_IMAGE:'s_api:v1.0.0', //TODO getCurrentApiVerssion()
        }));

        return response.ok({message:logs.ok?'in runing':'check errors',logs})

    }
}