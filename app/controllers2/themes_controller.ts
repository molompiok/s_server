import Theme from '#models/theme'
import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db';
import { applyOrderBy } from './Utils/query.js';
import { v4 } from 'uuid';
import { serviceNameSpace } from './Utils/functions.js';
import { inspectDockerService } from './StoreTools/Docker.js';
import { restartTheme, runTheme, stopTheme } from './ThemeTools/index.js';
import { updateNginxServer } from './StoreTools/Nginx.js';
import { updateRedisHostPort } from './StoreTools/RedisCache.js';
import { testRedis } from './StoreTools/Teste.js';


/*

create theme (name, version, dir ) / Admin

 */

async function canManageTheme(theme_id: string, user_id: string, response: HttpContext['response']) {
  console.log({theme_id});
  
  if (!theme_id) {
    return response.badRequest({ message: 'Theme ID is required' })
  }

  const theme = await Theme.find(theme_id)
  if (!theme) {
    return response.notFound({ message: 'Theme not found' })
  }

  if (user_id) {
    //TODO ADMIN
    // return response.forbidden({ message: 'Forbidden operation' })
  }
  return theme;
}

export default class ThemesController {

    async create_theme({ request, response, auth }: HttpContext) {
        const { name, version, source, internal_port } = request.only(['name', 'version', 'source', 'internal_port'])
        const user = await auth.authenticate()
        if (user) { 
            // ADMIN
        }
        if (!name) return response.badRequest({ message: 'Name is required' });
        const theme_id = v4()
        const theme = await Theme.create({
            id: theme_id,
            name,
            version, 
            source, 
            internal_port
        })
        await runTheme(theme)
        return theme.$attributes
    }

    async update_theme({ request, response, auth }: HttpContext) {
        const body = request.only(['name', 'version', 'source', 'internal_port', 'theme_id'])
        const user = await auth.authenticate()
        if (user) {
            // ADMIN
        }
        if (!body.theme_id) return response.badRequest({ message: 'theme_id is required' });

        const theme = await Theme.find(body.theme_id);
        if (!theme) return response.notFound('Theme not found');
        theme.merge(body);

        await theme.save()
        return response.ok(theme.$attributes);
    }

    async get_themes({ request, response }: HttpContext) {
        const { theme_id, name, version, source, internal_port, order_by, page = 1, limit = 10 } = request.qs()
        try {

            const pageNum = Math.max(1, parseInt(page))
            const limitNum = Math.max(1, parseInt(limit))

            let query = db.from(Theme.table).select('*')

            if (theme_id) {
                query.where('id', theme_id)
            }
            if (internal_port) {
                query.where('internal_port', internal_port)
            }

            if (name) {
                const searchTerm = `%${name.toLowerCase()}%`
                query.where('LOWER(stores.name) LIKE ?', [searchTerm])
            }

            if (source) {
                const searchTerm = `%${source.toLowerCase()}%`
                query.where('LOWER(stores.source) LIKE ?', [searchTerm])
            }
            if (version) {
                const searchTerm = `%${version.toLowerCase()}%`
                query.where('LOWER(stores.version) LIKE ?', [searchTerm])
            }

            if (order_by) {
                query = applyOrderBy(query, order_by, Theme.table)
            }

            // Pagination
            const storesPaginate = await query.paginate(pageNum, limitNum)

            return response.ok({ list: storesPaginate.all(), meta: storesPaginate.getMeta() })
        } catch (error) {
            console.error('Error in get_store:', error)
            return response.internalServerError({ message: 'Une erreur est survenue', error })
        }
    }

    async test_theme({ request, response, auth }: HttpContext) {
        const user = await auth.authenticate()
        const theme_id = request.param('id')
        
        const {BASE_ID} = serviceNameSpace(theme_id);
        try {
            const theme = await canManageTheme(theme_id, user.id, response);
            if(!theme) return
            const inspect = await inspectDockerService(BASE_ID);
          return response.ok({ theme, inspect})
        } catch (error) {
          console.error('Error in restart_store:', error)
          return response.internalServerError({ message: 'Store not reload', error: error.message })
        }
      }
      async stop_theme({ request, response, auth }: HttpContext) {
        const user = await auth.authenticate()
        const theme_id = request.param('id')
        
        try {
            const theme = await  canManageTheme(theme_id, user.id, response);
        if(!theme) return
          await stopTheme(theme);
          
          await theme.save();
          await updateNginxServer();
          await updateRedisHostPort(theme_id,()=>[]);
          await testRedis(theme.id)
          return response.ok({ theme, message: "theme is stoped" })
        } catch (error) {
          console.error('Error in stop_theme:', error)
          return response.internalServerError({ message: 'Store not stop', error: error.message })
        }
      }
    
      async restart_theme({ request, response, auth }: HttpContext) {
        const user = await auth.authenticate()
        const theme_id = request.param('id')
        
        try {
            const theme = await  canManageTheme(theme_id, user.id, response);
            if(!theme) return
          
          await restartTheme(theme);
          await updateNginxServer();
          // await updateRedisHostPort(theme_id,()=>[]);
          await testRedis(theme.id);
          return response.ok({ theme, message: "theme is runing" })
        } catch (error) {
          console.error('Error in restart_theme:', error)
          return response.internalServerError({ message: 'Store not reload', error: error.message })
        }
      }
    

    async delete_theme({ request, response, auth }: HttpContext) {
        const theme_id = request.param('id')
        const user = await auth.authenticate()
        const theme = await  canManageTheme(theme_id, user.id, response);
        if (!theme) return
        await updateNginxServer();
        await theme.delete();

        return response.ok({ isDeleted: theme.$isDeleted })
    }
}