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
import { allocAvalaiblePort} from "./StoreTools/PortManager.js";

import { deleteStore, reloadStore, runNewStore, startStore, stopStore, testStore } from './StoreTools/index.js';
import {  updateNginxStoreDomaine, updateNginxServer } from './StoreTools/Nginx.js';
import { Logs } from './Utils/functions.js';

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

A => Create Store (name, logo, banner, user(auth), description) Admin ?(user_id, port, id )
  % si le store existe on return
     % en cas de port deja utilser changer le port
     % ou metre un systeme d'allocation de port pour une period donne (10min 10*60*100)
  % on cree le store dans server_db
  @ ajoute le forfait par defaut
  % on cree la db (store_id)
  = on init redis (store_id)
  % on cree le api user
  % on cree le api volume
  % on run le container (volume,env (store_id, user_id), port)
  % on test le container ( verifier les information courant/ par une route) 
      // si les test ne passe pas les Admins sont notifier pour rasurer le client et corriger le probleme
  = on update de fichier de configuration nginx du server // auto create
    = pour chaque store, on joute le chemin server/store
    = tester puis avec le ne nouveau chemin server/store
  

resultat: - un container cree et lancer 
          - dans le quel l'api tourne sur son port primaire
          - et disposant des information sur l'user_id et store_id
          - pour communiquer via redis au server

B => Update Store (name, logo, banner, user(auth), description) Admin ?(port)
  = metre ajour les information dans la db
  = si name/port => metre a jour le file nginx server et le nginx domain  

K => Add domaine
  = update la db store.domaine 
  = update nginx domaine store.id / auto create

  
L => remove domaine
  = update la db store.domaine 
  = update nginx domaine store.id / auto create / auto remove
 
C @@@@@@@@@@@=> Update API // - test
  
  = configurer git Repo

  - git notifi, la route /api/update est appeler ()
  = on cree une nouvelle image de l'api
  - pour chaque store une nouvelle instance [] succesivement avec max n new container en attente 
  - on run le nouveau container (volume,env (store_id, user_id), port) (+1 sur l'attente)
  - on test le nouveau container
  - on active le compteur de requette
  - on change les privileges (nginx)
  - a 0 requette l'ancien api signale le server ou le supprimer ( -1 sur l'attente )
  - monter la progression (total ctn, currents waiting store info , total ready )

D => Stop Store // - test
  = store.active = false // vike va aficher une page d'inactiviter
  = stoper le container

E => Sart Store // - test
  = store.active = true // vike va servir le front
  = start le container

F => Delete Store // - test
  = suprimer le volume du store
  = suprimer les users et group
  = suprimer la db du store
  = fermer la connection redis avec le store
  = stop et remove le conatiner
  = suprimer le store dans la db du server 
  = suprimer les config  files nginx (update le nginx server) et sremove  le nginx domain
  

G => Reload Store // - test
  = update api container(store.id); 

G => Test Store // - test
  = test le conatiner server/slash_store

*/


async function canManageStore(store_id: string, user_id: string, response: HttpContext['response']) {
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


  async create_store({ request, response, auth }: HttpContext) {
    const logs = new Logs()
    try {
      const { user_id, name, description, port } = request.only(['user_id', 'name', 'description','port'])
      let user;
      if (!name) {
        return response.badRequest({ message: 'name_require' })
      }
      if(port){
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
      const banner = await createFiles({
        request,
        column_name: "banner",
        table_id: store_id,
        table_name: Store.table,
        options: {
          throwError: true,
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
          throwError: true,
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
      const api_port = port||await allocAvalaiblePort()
      const current_theme_id = v4();

      
      let store = await Store.create({
        id: store_id,
        name: name,
        description: description || '',
        user_id: user.id,
        api_port,
        // domaines,
        disk_storage_limit_gb,
        expire_at,
        current_theme_id,
        logo: JSON.stringify(logo),
        banner: JSON.stringify(banner),
      })
      console.log(`✅ Nouveau store ajouté en DB: ${store.id}`)
      /* Run un nouveau Store */
      logs.merge(await runNewStore(store))

      return response.created(store);
    } catch (error) {
      logs.logErrors('Error in create_store:', error)
      return response.internalServerError({ message: 'Store not created', error: error.message })
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

  async update_store({ request, response, auth }: HttpContext) {
    const user = await auth.authenticate()
    const { name, description, store_id, port } = request.only(['name', 'description', 'store_id', 'port']);
    const body = request.body();

    if (port) {
      //Admin
    }

    try {

      const store = await canManageStore(store_id, user.id, response);
      if (!store) return
      const isNginxSereverUpdateRequired =
        (
          !!port && (
            store.api_port !== port
          )
        ) || (
          store.name !== name
        )

      store.merge({ name, api_port:port,description })

      let urls = [];

      for (const f of ['banner', 'logo'] as const) {
        if (!body[f]) continue;

        urls = await updateFiles({
          request,
          table_name: Store.table,
          table_id: store_id,
          column_name: f,
          lastUrls: store[f],
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
        store[f] = JSON.stringify(urls);
      }

      await store.save()
      if (isNginxSereverUpdateRequired) {
        await updateNginxServer();
      }
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
      await deleteStore(store);
      await store.delete()
      await deleteFiles(store_id)
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
      store.is_active = false;
      await store.save();

      return response.ok({ store, message: "store is stoped" })
    } catch (error) {
      console.error('Error in stop_store:', error)
      return response.internalServerError({ message: 'Store not stop', error: error.message })
    }
  }

  async start_store({ request, response, auth }: HttpContext) {
    const user = await auth.authenticate()
    const store_id = request.param('id');

    const store = await canManageStore(store_id, user.id, response);
    if (!store) return

    try {

      await startStore(store);
      store.is_active = true;
      await store.save();

      return response.ok({ store, message: "store is runing" })
    } catch (error) {
      console.error('Error in start_store:', error)
      return response.internalServerError({ message: 'Store not satrt', error: error.message })
    }
  }
  async reload_store({ request, response, auth }: HttpContext) {
    const user = await auth.authenticate()
    const store_id = request.param('id')

    const store = await canManageStore(store_id, user.id, response);
    if (!store) return

    try {

      await reloadStore(store);

      return response.ok({ store, message: "store is runing" })
    } catch (error) {
      console.error('Error in reload_store:', error)
      return response.internalServerError({ message: 'Store not reload', error: error.message })
    }
  }
  async test_store({ request, response, auth }: HttpContext) {
    const user = await auth.authenticate()
    const store_id = request.param('id')

    const store = await canManageStore(store_id, user.id, response);
    if (!store) return

    try {
      const a = await testStore(store);

      return response.ok({ store, message: a ? "store is runing" : 'Store is stoped' })
    } catch (error) {
      console.error('Error in reload_store:', error)
      return response.internalServerError({ message: 'Store not reload', error: error.message })
    }
  }

  async add_store_domaine({ request, response, auth }: HttpContext) {
    const user = await auth.authenticate()
    const {store_id,domaine} = request.only(['domaine','store_id']);

    const store = await canManageStore(store_id, user.id, response);
    if (!store) return
    try {

      let domaines: Array<string> = [];

      try {
        domaines = JSON.parse(store.domaines);
      } catch (error) { }

      store.domaines = JSON.stringify([...domaines,domaine]);
      
      await store.save();

      await updateNginxStoreDomaine(store);
      return response.ok({ store, message: "Domaine successfuly added" })
    } catch (error) {
      console.error('Error in reload_store:', error)
      return response.internalServerError({ message: 'Store not reload', error: error.message })
    }
  }


  async remove_store_domaine({ request, response, auth }: HttpContext) {
    const user = await auth.authenticate()
    const {store_id,domaine} = request.only(['domaine','store_id']);

    const store = await canManageStore(store_id, user.id, response);
    if (!store) return
    try {

      let domaines: Array<string> = [];

      try {
        domaines = JSON.parse(store.domaines);
      } catch (error) { }

      store.domaines = JSON.stringify(domaines.filter(d=>d==domaine));
      
      await store.save();

      await updateNginxStoreDomaine(store);

      return response.ok({ store, message: "Domaine successfuly added" });

    } catch (error) {
      console.error('Error in reload_store:', error)
      return response.internalServerError({ message: 'Store not reload', error: error.message })
    }
  }


}
