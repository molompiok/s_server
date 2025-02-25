import Theme from '#models/theme'
import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db';
import { applyOrderBy } from './Utils/query.js';
import { v4 } from 'uuid';

export default class ThemesController {

    async create_theme({ request, response, auth }: HttpContext) {
        const { name } = request.only(['name'])
        const user = await auth.authenticate()
        if (user) {
            // ADMIN
        }
        if (!name) return response.badRequest({ message: 'Name is required' });
        const theme_id = v4()
        const theme = await Theme.create({
            id:theme_id,
            name,
        })

        return theme.$attributes
    }

    async update_theme({ request, response, auth }: HttpContext) {
        const { name,theme_id } = request.only(['name','theme_id'])
        const user = await auth.authenticate()
        if (user) {
            // ADMIN
        }
        if (!theme_id) return response.badRequest({ message: 'theme_id is required' });

        const theme = await Theme.find(theme_id);
        if (!theme) return response.notFound('Theme not found')
        if(name) theme.name = name ;

        await theme.save()
        return response.ok(theme.$attributes);
    }

    async get_themes({ request, response }: HttpContext) {
        const { theme_id, name, order_by, page = 1, limit = 10 } = request.qs()
        try {

            const pageNum = Math.max(1, parseInt(page))
            const limitNum = Math.max(1, parseInt(limit))

            let query = db.from(Theme.table).select('*')

            if (theme_id) {
                query.where('id', theme_id)
            }

            if (name) {
                const searchTerm = `%${name.toLowerCase()}%`
                query.where((q) => {
                    q.whereRaw('LOWER(stores.name) LIKE ?', [searchTerm])
                        .orWhereRaw('LOWER(stores.description) LIKE ?', [searchTerm])
                })
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
    async delete_theme({ request, response, auth }: HttpContext) {
        const theme_id = request.param('id')
        const user = await auth.authenticate()
        if (user) {
            // ADMIN
        }
        if (!theme_id) return response.badRequest({ message: 'Name is required' });

        const theme = await Theme.find(theme_id);
        if (!theme) return response.notFound('Theme not found')
        await theme.delete();
        return response.ok({ isDeleted: theme.$isDeleted })
    }
}