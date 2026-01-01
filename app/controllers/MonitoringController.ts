import type { HttpContext } from '@adonisjs/core/http';
import MonitoringService from '#services/MonitoringService';
import AppService from '#services/AppService';
import ThemeService from '#services/ThemeService';
import StoreService from '#services/StoreService';
import SwarmService from '#services/SwarmService';
import Theme from '#models/theme';
import Store from '#models/store';
import vine from '@vinejs/vine';

export default class MonitoringController {
    async index({ response, bouncer, auth }: HttpContext) {
        await auth.authenticate();
        await bouncer.authorize('performAdminActions');

        const data = await MonitoringService.getMonitoringData();
        return response.ok(data);
    }

    async action({ request, response, bouncer, auth }: HttpContext) {
        await auth.authenticate();
        await bouncer.authorize('performAdminActions');

        const validator = vine.compile(
            vine.object({
                id: vine.string(),
                type: vine.enum(['app', 'theme', 'store']),
                action: vine.enum(['stop', 'restart', 'scale']),
                replicas: vine.number().min(0).optional(),
            })
        );

        const payload = await request.validateUsing(validator);
        const { id, type, action, replicas } = payload;

        let result: any;
        let serviceName = id;

        if (type === 'theme') {
            const theme = await Theme.findOrFail(id);
            serviceName = `theme_${theme.id}`;
            if (action === 'stop') result = await ThemeService.stopThemeService(theme);
            else if (action === 'restart') result = await ThemeService.restartThemeService(theme.id);
            else if (action === 'scale') result = await SwarmService.scaleService(serviceName, replicas || 0);
        } else if (type === 'store') {
            const store = await Store.findOrFail(id);
            serviceName = `api_store_${store.id}`;
            if (action === 'stop') result = await StoreService.stopStoreService(store);
            else if (action === 'restart') result = await StoreService.restartStoreService(store.id);
            else if (action === 'scale') result = await SwarmService.scaleService(serviceName, replicas || 0);
        } else if (type === 'app') {
            if (action === 'stop') result = await AppService.stopAppService(id);
            else if (action === 'restart') result = await SwarmService.forceServiceUpdate(id);
            else if (action === 'scale') result = await AppService.scaleAppService(id, replicas || 0);
        }

        return response.ok({ success: !!result, result });
    }

    async groupAction({ request, response, bouncer, auth }: HttpContext) {
        await auth.authenticate();
        await bouncer.authorize('performAdminActions');

        const validator = vine.compile(
            vine.object({
                type: vine.enum(['app', 'theme', 'store', 'all']),
                action: vine.enum(['stop', 'start']),
            })
        );

        const { type, action } = await request.validateUsing(validator);
        const results: any[] = [];

        if (type === 'app' || type === 'all') {
            // Apps are usually always running, but we can scale them to 0 or 1
            const apps = [
                process.env.APP_SERVICE_WELCOME || 's_welcome',
                process.env.APP_SERVICE_DASHBOARD || 's_dashboard',
                process.env.APP_SERVICE_DOCS || 's_docs',
                process.env.APP_SERVICE_ADMIN || 's_admin',
            ];
            for (const app of apps) {
                if (action === 'stop') results.push(await AppService.stopAppService(app));
                else results.push(await AppService.startAppService(app));
            }
        }

        if (type === 'theme' || type === 'all') {
            const themes = await Theme.query().where('is_active', true);
            for (const theme of themes) {
                if (action === 'stop') results.push(await ThemeService.stopThemeService(theme));
                else results.push(await ThemeService.startThemeService(theme));
            }
        }

        if (type === 'store' || type === 'all') {
            const stores = await Store.query().where('is_active', true);
            for (const store of stores) {
                if (action === 'stop') results.push(await StoreService.stopStoreService(store));
                else results.push(await StoreService.startStoreService(store));
            }
        }

        return response.ok({ success: true, results });
    }
}
