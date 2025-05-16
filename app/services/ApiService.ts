// app/services/ApiService.ts
import Api from '#models/api'
import Store from '#models/store' // Import pour vérifier l'utilisation avant suppression
import { Logs } from '../Utils/functions.js' // Assure-toi que le chemin est correct
import { v4 as uuidv4 } from 'uuid'
import db from '@adonisjs/lucid/services/db'

interface ApiData {
    name: string;
    description?: string | null;
    docker_image_name: string;
    docker_image_tag: string;
    internal_port: number;
    source_path?: string | null;
    is_default?: boolean;
}

interface ApiListOptions {
    page?: number;
    limit?: number;
    orderBy?: string; // e.g., 'name_asc', 'createdAt_desc'
    filterName?: string;
}

interface ServiceResult<T> {
    success: boolean;
    data?: T | null;
    error?: string; // Message d'erreur pour le serveur/log
    clientMessage?: string; // Message sûr pour le client
    logs: Logs;
}

class ApiService {

    /**
     * Crée une nouvelle définition d'API.
     */
    async createApi(data: ApiData): Promise<ServiceResult<Api>> {
        const logs = new Logs('ApiService.createApi');
        try {
            // L'unicité du slug est gérée par le hook beforeSave du modèle.
            // Si is_default=true, il faudrait peut-être s'assurer qu'aucun autre n'est default.
             if(data.is_default) {
                 await Api.query().where('is_default', true).update({ is_default: false });
                 logs.log('ℹ️ Ancien API par défaut désactivé.');
             }

            const api = await Api.create({
                id: uuidv4(), // Génère l'UUID explicitement
                ...data
            });
            logs.log(`✅ API ${api.id} créée en BDD.`);
            return { success: true, data: api, logs };

        } catch (error) {
            // Capturer une éventuelle violation d'unicité du slug non gérée par le hook (rare)
             if (error.code === '23505') { // Code d'erreur PostgreSQL pour violation unique
                 logs.notifyErrors(`❌ Erreur création API: le slug '${data.name}' existe probablement déjà (non géré par le hook?).`, { data }, error);
                 return { success: false, error: error.message, clientMessage: "Ce nom d'API existe déjà.", logs };
             }
            logs.notifyErrors('❌ Erreur BDD lors de la création de l\'API', { data }, error);
             return { success: false, error: error.message, clientMessage: 'Erreur serveur lors de la création.', logs };
        }
    }

    /**
     * Met à jour une définition d'API.
     */
    async updateApi(apiId: string, data: Partial<ApiData>): Promise<ServiceResult<Api>> {
        const logs = new Logs(`ApiService.updateApi (${apiId})`);
        try {
            const api = await Api.find(apiId);
            if (!api) {
                return { success: false, clientMessage: 'API non trouvée.', logs: logs.logErrors(`❌ API ${apiId} non trouvée.`) };
            }

            // Si on essaie de mettre is_default=true
            if (data.is_default && !api.is_default) {
                 await Api.query().whereNot('id', apiId).where('is_default', true).update({ is_default: false });
                 logs.log('ℹ️ Ancien API par défaut désactivé.');
            }

            // L'unicité du nouveau slug sera gérée par le hook beforeSave du modèle.
            api.merge(data);
            await api.save();

            logs.log(`✅ API ${apiId} mise à jour.`);
            return { success: true, data: api, logs };

        } catch (error) {
             // Gérer l'erreur de slug unique potentielle
            if (error.code === '23505') {
                logs.notifyErrors(`❌ Erreur MàJ API: le nouveau nom '${data.name}' crée un conflit de slug.`, { apiId, data }, error);
                 return { success: false, error: error.message, clientMessage: "Ce nouveau nom d'API existe déjà.", logs };
             }
            logs.notifyErrors('❌ Erreur BDD lors de la mise à jour de l\'API', { apiId, data }, error);
             return { success: false, error: error.message, clientMessage: 'Erreur serveur lors de la mise à jour.', logs };
        }
    }

    /**
     * Récupère une liste paginée de définitions d'API.
     */
    async getApisList(options: ApiListOptions): Promise<any> {
        const logs = new Logs('ApiService.getApisList');
        try {
            const { page = 1, limit = 10, orderBy = 'name_asc', filterName } = options;

            const query = Api.query();

            // Filtrage
            if (filterName) {
                 query.where((builder) => {
                    builder.where('name', 'ILIKE', `%${filterName}%`)
                           .orWhere('description', 'ILIKE', `%${filterName}%`);
                 });
            }

            // Tri
             const [column = 'name', direction = 'asc'] = orderBy.split('_');
             if(['name', 'createdAt'].includes(column) && ['asc', 'desc'].includes(direction)) {
                 query.orderBy(column, direction as 'asc' | 'desc');
             } else {
                  query.orderBy('name', 'asc'); // Tri par défaut
             }

            // Pagination
            const apis = await query.paginate(page, limit);

            logs.log(`✅ Récupération de ${apis.length} APIs.`);
            return { success: true, data: apis, logs };

        } catch (error) {
            logs.notifyErrors('❌ Erreur lors de la récupération de la liste des APIs', { options }, error);
            return { success: false, error: error.message, clientMessage: 'Erreur serveur lors de la récupération.', logs };
        }
    }

    /**
     * Récupère une définition d'API par son ID.
     */
    async getApiById(apiId: string): Promise<ServiceResult<Api>> {
        const logs = new Logs(`ApiService.getApiById (${apiId})`);
        try {
            const api = await Api.find(apiId);
            if (!api) {
                return { success: false, clientMessage: 'API non trouvée.', logs: logs.logErrors(`❌ API ${apiId} non trouvée.`) };
            }
            logs.log(`✅ API ${apiId} trouvée.`);
            return { success: true, data: api, logs };

        } catch (error) {
            logs.notifyErrors('❌ Erreur BDD lors de la recherche de l\'API', { apiId }, error);
            return { success: false, error: error.message, clientMessage: 'Erreur serveur lors de la récupération.', logs };
        }
    }

    /**
     * Supprime une définition d'API si elle n'est pas utilisée.
     */
    async deleteApi(apiId: string): Promise<ServiceResult<null>> {
        const logs = new Logs(`ApiService.deleteApi (${apiId})`);
        let api: Api | null = null; // Garde une référence

        // Transaction pour lire et supprimer en toute sécurité
         const transaction = await db.transaction();
         try {
            api = await Api.query({ client: transaction }).where('id', apiId).first();

            if (!api) {
                 await transaction.rollback(); // Annule transaction même si pas d'erreur BDD
                return { success: true, logs: logs.log(`ℹ️ API ${apiId} non trouvée, suppression non nécessaire.`) };
            }
             // Si on tente de supprimer l'API par défaut, on interdit.
             if (api.is_default) {
                await transaction.rollback();
                return { success: false, clientMessage: "Suppression de l'API par défaut interdite.", logs: logs.logErrors('❌ Tentative de suppression de l\'API par défaut.') };
             }


            // Vérifie si l'API est utilisée par un store (dans la même transaction)
             const storeUsingApi = await Store.query({ client: transaction })
                                                .where('current_api_id', apiId)
                                                .first();

            if (storeUsingApi) {
                 await transaction.rollback();
                 return { success: false, clientMessage: 'API actuellement utilisée par un ou plusieurs stores.', logs: logs.logErrors(`❌ API ${apiId} utilisée par store ${storeUsingApi.id}.`) };
             }

             // Si non utilisée, la supprimer
            await api.useTransaction(transaction).delete();
            await transaction.commit(); // Valide la suppression

            logs.log(`✅ API ${apiId} supprimée avec succès.`);
            return { success: true, logs };

        } catch (error) {
            await transaction.rollback(); // Assure rollback en cas d'erreur
            logs.notifyErrors('❌ Erreur BDD lors de la suppression de l\'API', { apiId }, error);
             // L'erreur de clé étrangère *ne devrait* pas arriver grâce à la vérification préalable,
             // mais si ça arrive (ex: race condition hors transaction), ce sera une erreur BDD générique.
             return { success: false, error: error.message, clientMessage: 'Erreur serveur lors de la suppression.', logs };
        }
    }
}

// Exporte une instance unique (Singleton)
export default new ApiService()