import { DatabaseQueryBuilderContract } from '@adonisjs/lucid/types/querybuilder'

export function paginate<T extends { page: number | undefined; limit: number | undefined }>(
  paginable: T
): T & { page: number; limit: number } {
  let { page, limit } = paginable

  if (page && page < 1) throw new Error(' page must be between [1 ,n] ')
  if (limit && limit < 1) throw new Error(' limit must be between [1 ,n] ')

  page = page ? Number(page) : 1
  limit = limit ? Number(limit) : 25

  return {
    ...paginable,
    limit,
    page,
  }
}

export function applyOrderBy(
    query: DatabaseQueryBuilderContract<any> | any,
    order_by: string,
    tableName: string
  ): any {
    try {
      if (order_by === 'date_asc') {
        query = query.orderBy(`${tableName}.created_at`, 'asc')
      } else if (order_by === 'date_desc') {
        query = query.orderBy(`${tableName}.created_at`, 'desc')
      } else {
        const orderByParts = order_by.split('_')
        const column = orderByParts.slice(0, -1).join('_')
        const mode = orderByParts[orderByParts.length - 1] as 'asc' | 'desc'
  
        if (['asc', 'desc'].includes(mode)) {
          query = query.orderBy(column, mode)
        } else {
          query = query.orderBy(`${tableName}.created_at`, 'desc')
        }
      }
    } catch (e) {
      query = query.orderBy(`${tableName}.created_at`, 'desc')
    }
  
    return query
  }
