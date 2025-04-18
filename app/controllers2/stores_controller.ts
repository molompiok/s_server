import type { HttpContext } from '@adonisjs/core/http'
import Store from "#models/store";
import { v4 } from 'uuid';
import { DateTime } from 'luxon';
import db from '@adonisjs/lucid/services/db';
import { applyOrderBy } from './Utils/query.js';
import User from '#models/user';
import { createFiles } from './Utils/FileManager/CreateFiles.js';
import { extSupported, MegaOctet } from './Utils/ctrlManager.js';
import { updateFiles } from './Utils/FileManager/UpdateFiles.js';
import { deleteFiles } from './Utils/FileManager/DeleteFiles.js';

import { deleteStore, restartStore, runStoreApi, stopStore } from './StoreTools/index.js';
import { updateNginxStoreDomaine, updateNginxServer } from './StoreTools/Nginx.js';
import { Logs, serviceNameSpace } from './Utils/functions.js';
import env from '#start/env';
import { setRedisStore, updateRedisHostPort } from './StoreTools/RedisCache.js';
import Theme from '#models/theme';
import { testRedis } from './StoreTools/Teste.js';
import { inspectDockerService } from './StoreTools/Docker.js';
/*

Question : pourquoi le port 0.0.0.0

ACTION_INITIAL : 
  - install sur le vps : volta,node,pnpm,nginx,psql,docker,redis
  - sudo visudo # pour ajouter => %noga ALL=(ALL) NOPASSWD:/usr/bin/docker,/usr/bin/psql,/usr/sbin/nginx,/bin/mkdir,/bin/chown,/bin/chmod,/usr/bin/chown,/usr/sbin/usermod,/usr/sbin/groupadd,/usr/sbin/adduser,/usr/bin/pg_isready
  - 

@@@@@@@@ cree une function runStore(store) qui va ce cherger de:
          - lancer le store
          - verifier chaque etape si deja existante (skipe ou crre)
          - tester le reponse de chaque etape.
          - fournir un bilan detailler en cas d'erreur
- tester les permision de volume api - server - noga ou --mount type=bind

A => ✅ Create Store (name, logo, banner, user(auth), description) Admin ?(user_id, port, id )
  🟢 si le store existe on return
  🟢 systeme d'allocation dynamoque pour reserver le un port disponible
      ✔️ sur le reaux et non allouer, pour une periode donne 10min=10*60*100
      🚫 tester les ip pour allouer aussi les bons ip => host_port    
  🟢 on cree le store dans server_db
  🚫 ajoute le forfait par defaut
  🟢 on cree la db (store_id)
  🟢 on add dans redis (store_id)
  🟢 on cree le api user
  🟢 on cree le api volume
  🟢 on run le container (volume,env (store_id, user_id), port)
  🟢 on test le container ( verifier les information courant/ par une route) 
  🚫 si les test ne passe pas les Admins sont notifier pour rasurer le client et corriger le probleme
      🚫(new Logs()).notifyErrors(...[])
  🟢 on update de fichier de configuration nginx du server  
      ✔️ auto create  du server.conf
      ✔️ pour chaque store, on joute le chemin server/slash_store
      ✔️ tester puis avec le ne nouveau chemin server/store
  
B => Update Store (name, logo, banner, user(auth), description) Admin ?(port)
  🟢  metre ajour les information dans la db (name, description, logo, banner );
  🚫  metre ajour les info dans Redis
  🟢  si name => updateNginxServer() 
      updateNginxServer()
        ✔️ cree/update un ficher server.conf  
        ✔️ pour chaque store ajouter le server/slash
        ✔️ pour chaque store ajouter le stream du theme dans le server/slash
        ✔️ si le store.current_theme = null les theme est apiTheme Redis=>( theme_ip_port = store.api_ip_port)
        ✔️ pour chaque stream du theme rajout les ip_port paraleles et les priorite

O => update_store_theme (set_as_new_theme, theme_id, theme_config)
  🟢  si set_as_new_theme => store.current_theme_id = theme_id
  🟢  updateNginxServer()
  🟢  updateNginxStoreDomaine(store)
      ✔️ store.domaies < 0 => return
      ✔️ cree/update un ficher (store_base_id).conf
      ✔️ ajouter chaque domaine du store
      ✔️ metre un stream stream du theme courrant avec prioriter
   
  🚫 si theme_config => create/update store_theme_config (stocker les configuration du store)



K => Add domaine
  🟢update la db store.domaine 
  🟢update nginx domaine store.id / auto create

  
L => remove domaine
  🟢 update la db store.domaine 
  🟢 update nginx store.id / auto create / auto remove
 
C @@@@@@@@@@@=> Update API // - test
    = configurer git Repo

  - git otifi, la route /api/update est appeler ()
  = on cree une nouvelle image de l'api
  => UpdateStoreContainer => pour chaque store on update:
    - recupreration des env du precedant container edit (expternal_port,image_version)
    - new container sur un nouveau expternal_port / test
    - registrement dans redis[store.id].ip_port.push({port: new_ip_port,privilege:2});
    - si current_theme_id = null => updateNginxServer() ; store.domaine > 0 updateNginxStoreDomaine();
    - on active le compteur de requette => a la fin sublymus delete le container, puis le Redis port et actualise les privilaiges

  - monter la progression (total ctn, currents waiting store info , total ready )

D => Stop Store // - test
  🟢 delete api instances required,
  🟢 update server.conf


G => Reload Store // - test
  🟢 delete api instances required,
  🟢 start un container
  🟢 update server.conf
  
F => Delete Store // - test
  🟢 suprimer le volume du store
  🟢 suprimer les users et group
  🟢 suprimer la db du store
  🟢 stop et remove chaque conatiner du store
  🟢= fermer la connection redis avec le store
  🟢= suprimer le h_ps du store dans Redis
  🟢 suprimer le store dans la db du server 
  🟢 suprimer les config  files nginx (update le nginx server)
   remove  le nginx domain
  
G => Test Store // - test
  🟢 test le conatiner server/slash_store

AMELIORATION
  => les theme peuvent directement servire theme_address_stream/store_name; ainsi dans le cas api theme ou l'api est en arret et engendre des confic de port l'api courrant peut redirier vres server/api_do_not_listen
CAS D'ERRORS
  => quand une api est a l'arret(docker instance), sont port n'est plus utiliser et peut etrre utiler par d'autre,
  on definie automatiquement sont address theme comme etant celui du server/api_do_not_listen ou le server va afficher une page de maintenance.
  => si l'api a planter le theme peut demander a server/api_do_not_listen
  => si le theme est api alors nginx peux rediriger vers server/api_do_not_listen
*/


/*



*/

async function canManageStore(store_id: string, user_id: string, response: HttpContext['response']) {
  console.log({store_id});
  
  if (!store_id) {
    return response.badRequest({ message: 'Store ID is required' })
  }

  const store = await Store.find(store_id)
  if (!store) {
    return response.notFound({ message: 'Store not found' })
  }

  if (store.user_id !== user_id) {
    //TODO ou ADMIN
    return response.forbidden({ message: 'Forbidden operation' })
  }
  return store;
}

export default class StoresController {


  async can_manage_store({ request, response, auth }: HttpContext) {
    const user = await auth.authenticate()
    const { store_id } = request.only(['name', 'description', 'store_id',]);
    const store = await canManageStore(store_id, user.id, response);
      if (!store) return store
  }

  async create_store({ request, response, auth }: HttpContext) {
    const logs = new Logs()
    try {
      const { user_id, name, description,title, port,host } = request.only(['user_id', 'name', 'title','description', 'port','host']);
      console.log(request.body());
      
      let user;
      if (!name) {
        return response.badRequest({ message: 'name_require' })
      }
      const exist = await Store.findBy('name',name);
      if(exist) {
        return response.conflict({is_availableble_name:false});
      }
      if (port||host) {
        //ADMIN
      }
      if (user_id) {
        //Admin
        user = await User.find(user_id)
      } else {
        user = await auth.authenticate()
      }
      if (!user) {
        return response.notFound({ message: 'user_require' })
      }

      /* IS AVALIBLE NAME */
      const existStore = await Store.findBy('name', name);
      if (existStore) {
        console.error(`❌ Erreur sotre already exist in server_db`)
        return response.conflict({ message: 'sotre_already_exist' })
      }

      const store_id = v4();

      /* CREE LA BOUTIQUE EN DB */
      //TODO le logo et le banner sont facultatif pendant la creation / cote client une image par defaut sera afficher
      const cover_image = await createFiles({
        request,
        column_name: "cover_image",
        table_id: store_id,
        table_name: Store.table,
        options: {
          throwError: false,
          compress: 'img',
          min: 0,
          max: 1,
          extname: extSupported,
          maxSize: 12 * MegaOctet,
        },
      });

      const logo = await createFiles({
        request,
        column_name: "logo",
        table_id: store_id,
        table_name: Store.table,
        options: {
          throwError: false,
          compress: 'img',
          min: 0,
          max: 1,
          extname: extSupported,
          maxSize: 12 * MegaOctet,
        },
      });

      /* DEFAULT VALUE */
      const expire_at = DateTime.now().plus({ days: 14 })
      const disk_storage_limit_gb = 1

      let store = await Store.create({
        id: store_id,
        name: name,
        title:title ||`Boutique <${name}> vente en ligne de produits divres`,
        description: description || '',
        user_id: user.id,
        domain_names: [`${name}.com`],
        disk_storage_limit_gb,
        expire_at,
        logo,
        cover_image,
      })
      console.log(`✅ Nouveau store ajouté en DB: ${store.id}`)
      /* Run un nouveau Store */
     

      logs.merge(await runStoreApi(store,(port||host)&& {
        date: Date.now(),
        host: env.get('HOST'),
        port: parseInt(port),
        weight: 1 // tout nouvelle  instance a un weight de 1, pendant son execution il demendera automatique un soutient suprementaire
      }));

      // testRedis(store.id)
      return response.created(store);
    } catch (error) {
      return response.internalServerError({ message: 'Store not created',logs:logs.logErrors('Error in create_store:', error)})
    }
  }

  async get_stores({ request, response, auth }: HttpContext) {
    try {
      const { store_id, name, order_by, page = 1, limit = 10, user_id } = request.qs()

      const pageNum = Math.max(1, parseInt(page))
      const limitNum = Math.max(1, parseInt(limit))

      let query = db.from(Store.table).select('*')

      if (store_id) {
        query.where('id', store_id)
        
      await testRedis(store_id)
      }

      if (user_id) {
        //TODO ADMIN
        const user = await auth.authenticate()
        query.where('user_id', user.id)
      }

      if (name) {
        const searchTerm = `%${name.toLowerCase()}%`
        query.where((q) => {
          q.whereRaw('LOWER(stores.name) LIKE ?', [searchTerm])
            .orWhereRaw('LOWER(stores.description) LIKE ?', [searchTerm])
        })
      }

      if (order_by) {
        query = applyOrderBy(query, order_by, Store.table)
      }

      // Pagination
      const storesPaginate = await query.paginate(pageNum, limitNum)

      return response.ok({ list: storesPaginate.all(), meta: storesPaginate.getMeta() })
    } catch (error) {
      console.error('Error in get_store:', error)
      return response.internalServerError({ message: 'Une erreur est survenue', error })
    }
  }

  async available_name({ request, response }: HttpContext) {
    const { name } = request.only(['name']);
    const exist = await Store.findBy('name', name);
    if (exist) {
      return response.conflict({is_availableble_name:false});
    }
    return response.ok({is_availableble_name:true})
  }

  async update_store({ request, response, auth }: HttpContext) {
    const user = await auth.authenticate()
    const { name, description, store_id } = request.only(['name', 'description', 'store_id',]);
    const body = request.body();
    if (name) {
      const exist = await Store.findBy('name', name);
      if (exist) {
        return response.conflict({ message: 'Le nom est deja utiliser ' });
      }
    }
    try {

      const store = await canManageStore(store_id, user.id, response);
      if (!store) return

      let urls = [];

      for (const f of ['cover_image', 'logo'] as const) {
        if (!body[f]) continue;

        urls = await updateFiles({
          request,
          table_name: Store.table,
          table_id: store_id,
          column_name: f,
          lastUrls: JSON.stringify(store[f]),
          newPseudoUrls: body[f],
          options: {
            throwError: true,
            min: 1,
            max: 1,
            compress: 'img',
            extname: extSupported,
            maxSize: 12 * MegaOctet,
          },
        });
        store[f] = urls;
      }

      const lastName = store.name;
      store.merge({ name, description })
      await store.save();
      await setRedisStore(store, lastName);

      if (name) {
        await updateNginxStoreDomaine(store,false)
        await updateNginxServer();
      }
      await testRedis(store.id)
      return response.ok(store)
      
    } catch (error) {
      console.error('Error in update_store:', error)
      return response.internalServerError({ message: 'Update failed', error: error.message })
    }
  }



  async change_store_theme({ request, response, auth }: HttpContext) {
    const user = await auth.authenticate()
    const { current_theme_id, set_as_new_theme, theme_config, store_id } = request.only(['set_as_new_theme', 'theme_config', 'store_id', 'current_theme_id']);
    try {

      const store = await canManageStore(store_id, user.id, response);
      if (!store) return
      const theme = await Theme.find(current_theme_id || '');

      if (set_as_new_theme) {
        store.current_theme_id = theme?.id || '';
        await store.save();
        await updateNginxStoreDomaine(store,false)
        await updateNginxServer();
      }
      if (theme_config) {
        //TODO
      }
      
      await testRedis(store.id)
      return response.ok(store)
    } catch (error) {
      console.error('Error in update_store:', error)
      return response.internalServerError({ message: 'Update failed', error: error.message })
    }
  }

  async delete_store({ request, response, auth }: HttpContext) {
    const user = await auth.authenticate()
    const store_id = request.param('id')
    const store = await canManageStore(store_id, user.id, response);
    if (!store) return
    try {
      await store.delete();
      await deleteStore(store);
      await deleteFiles(store_id)
      await updateNginxStoreDomaine(store,false)
      await updateNginxServer();
      await testRedis(store.id)
      return response.ok({ isDeleted: store.$isDeleted })
    } catch (error) {
      console.error('Error in delete_store:', error)
      return response.internalServerError({ message: 'Store not deleted', error: error.message })
    }
  }

  async stop_store({ request, response, auth }: HttpContext) {
    const user = await auth.authenticate()
    const store_id = request.param('id')

    const store = await canManageStore(store_id, user.id, response);
    if (!store) return

    try {

      await stopStore(store);
      
      await store.save();
      await updateNginxServer();
      await updateRedisHostPort(store_id,()=>[]);
      await testRedis(store.id)
      return response.ok({ store, message: "store is stoped" })
    } catch (error) {
      console.error('Error in stop_store:', error)
      return response.internalServerError({ message: 'Store not stop', error: error.message })
    }
  }

  async restart_store({ request, response, auth }: HttpContext) {
    const user = await auth.authenticate()
    const store_id = request.param('id')

    const store = await canManageStore(store_id, user.id, response);
    if (!store) return

    try {
      
      await restartStore(store);
      await updateNginxServer();
      // await updateRedisHostPort(store_id,()=>[]);
      await testRedis(store.id);
      return response.ok({ store, message: "store is runing" })
    } catch (error) {
      console.error('Error in restart_store:', error)
      return response.internalServerError({ message: 'Store not reload', error: error.message })
    }
  }

  async test_store({ request, response, auth }: HttpContext) {
    const user = await auth.authenticate()
    const store_id = request.param('id')
    
    const store = await canManageStore(store_id, user.id, response);
    if (!store) return
    const {BASE_ID} = serviceNameSpace(store.id);
    try {
      const inspect = await inspectDockerService(BASE_ID);
      return response.ok({ store, inspect})
    } catch (error) {
      console.error('Error in restart_store:', error)
      return response.internalServerError({ message: 'Store not reload', error: error.message })
    }
  }

  async add_store_domaine({ request, response, auth }: HttpContext) {
    const user = await auth.authenticate()
    const { store_id, domaine } = request.only(['domaine', 'store_id']);

    const store = await canManageStore(store_id, user.id, response);
    if (!store) return
    try {

      let domain_names: Array<string> = [];

      try {
        domain_names = store.domain_names;
      } catch (error) { }

      store.domain_names = [...domain_names, domaine];

      await store.save();
      await updateNginxStoreDomaine(store);

      await testRedis(store.id)
      return response.ok({ store, message: "Domaine successfuly added" })
    } catch (error) {
      console.error('Error in restart_store:', error)
      return response.internalServerError({ message: 'Store not reload', error: error.message })
    }
  }


  async remove_store_domaine({ request, response, auth }: HttpContext) {
    const user = await auth.authenticate()
    const { store_id, domaine } = request.only(['domaine', 'store_id']);

    const store = await canManageStore(store_id, user.id, response);
    if (!store) return
    try {

      let domain_names: Array<string> = [];

      try {
        domain_names = store.domain_names;
      } catch (error) { }

      store.domain_names = domain_names.filter(d => d != domaine);

      await store.save();
      await updateNginxStoreDomaine(store);

      await testRedis(store.id)
      return response.ok({ store, message: "Domaine successfuly added" });

    } catch (error) {
      console.error('Error in restart_store:', error)
      return response.internalServerError({ message: 'Store not reload', error: error.message })
    }
  }


}
