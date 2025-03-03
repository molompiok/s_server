import Api from '#models/api'
import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db';
import { applyOrderBy } from './Utils/query.js';
import { v4 } from 'uuid';

export default class ApiController {
    //Create by git update
    async create_api({ request, response, auth }: HttpContext) {
        const { name,source,internal_port,version } = request.only(['name','source','internal_port','version'])
        const user = await auth.authenticate()
        if (user) {
            // ADMIN
        }
        if (!name) return response.badRequest({ message: 'Name is required' });
        const api_id = v4()
        const api = await Api.create({
            id:api_id,
            name,
            source,
            internal_port,
            version
        });

        return api.$attributes
    }

    async update_api({ request, response, auth }: HttpContext) {
        const { name,api_id } = request.only(['name','api_id'])
        const user = await auth.authenticate()
        if (user) {
            // ADMIN
        }
        if (!api_id) return response.badRequest({ message: 'api_id is required' });

        const api = await Api.find(api_id);
        if (!api) return response.notFound('Api not found')
        if(name) api.name = name ;

        await api.save()
        return response.ok(api.$attributes);
    }

    async get_apis({ request, response }: HttpContext) {
        const { api_id, name,version,source, internal_port, order_by, page = 1, limit = 10 } = request.qs()
        try {

            const pageNum = Math.max(1, parseInt(page))
            const limitNum = Math.max(1, parseInt(limit))

            let query = db.from(Api.table).select('*')

            if (api_id) {
                query.where('id', api_id)
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
                query = applyOrderBy(query, order_by, Api.table)
            }

            // Pagination
            const storesPaginate = await query.paginate(pageNum, limitNum)

            return response.ok({ list: storesPaginate.all(), meta: storesPaginate.getMeta() })
        } catch (error) {
            console.error('Error in get_store:', error)
            return response.internalServerError({ message: 'Une erreur est survenue', error })
        }
    }
    async delete_api({ request, response, auth }: HttpContext) {
        const api_id = request.param('id')
        const user = await auth.authenticate()
        if (user) {
            // ADMIN
        }
        if (!api_id) return response.badRequest({ message: 'Name is required' });

        const api = await Api.find(api_id);
        if (!api) return response.notFound('Api not found')
        
            await api.delete();

        return response.ok({ isDeleted: api.$isDeleted })
    }
}