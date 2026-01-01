import SwarmService from '#services/SwarmService';
import RedisService from '#services/RedisService';
import Store from '#models/store';
import Theme from '#models/theme';
import env from '#start/env';
import logger from '@adonisjs/core/services/logger';
import si from 'systeminformation';

export interface ServiceStat {
    timestamp: number;
    cpu: number;
    memory: number;
    replicas: number;
}

export interface ServiceStatus {
    id: string;
    name: string;
    type: 'app' | 'theme' | 'store';
    status: 'running' | 'stopped' | 'error';
    current: ServiceStat;
    history: ServiceStat[];
}

export interface HostStat {
    timestamp: number;
    cpu: number;
    memory: number;
    disk: number;
    temp: number;
}

export interface HostStatus {
    os: {
        platform: string;
        distro: string;
        release: string;
    };
    uptime: number;
    cpu: {
        manufacturer: string;
        brand: string;
        cores: number;
    };
    current: HostStat;
    history: HostStat[];
}

class MonitoringService {
    private readonly HISTORY_KEY_PREFIX = 'monitoring:history:';
    private readonly HOST_HISTORY_KEY = 'monitoring:history:host';
    private readonly HISTORY_TTL = 24 * 60 * 60; // 24 hours

    private getGlobalApps(): string[] {
        return [
            env.get('APP_SERVICE_WELCOME', 's_welcome'),
            env.get('APP_SERVICE_DASHBOARD', 's_dashboard'),
            env.get('APP_SERVICE_DOCS', 's_docs'),
            env.get('APP_SERVICE_ADMIN', 's_admin'),
        ].filter(Boolean);
    }

    async collectStats(): Promise<void> {
        logger.info('[MonitoringService] Collecting stats...');
        const timestamp = Date.now();

        // 1. Global Apps
        const apps = this.getGlobalApps();
        for (const appName of apps) {
            await this.processServiceStats(appName, appName, timestamp);
        }

        // 2. Themes
        const themes = await Theme.query().where('is_active', true);
        for (const theme of themes) {
            const serviceName = `theme_${theme.id}`;
            await this.processServiceStats(theme.id, serviceName, timestamp);
        }

        // 3. Stores
        const stores = await Store.query().where('is_active', true);
        for (const store of stores) {
            const serviceName = `api_store_${store.id}`;
            await this.processServiceStats(store.id, serviceName, timestamp);
        }

        // 4. Host Stats
        await this.collectHostStats(timestamp);

        logger.info('[MonitoringService] Stats collection finished.');
    }

    private async collectHostStats(timestamp: number): Promise<void> {
        try {
            logger.info('[MonitoringService] Collecting host stats...');
            const [cpu, mem, disk, temp] = await Promise.all([
                si.currentLoad(),
                si.mem(),
                si.fsSize(),
                si.cpuTemperature(),
            ]);

            logger.info({ cpu: cpu.currentLoad, mem: mem.active, disk: disk.length, temp: temp.main }, '[MonitoringService] Raw host stats');

            const rootDisk = disk.find(d => d.mount === '/') || disk[0];
            const stat: HostStat = {
                timestamp,
                cpu: cpu.currentLoad,
                memory: (mem.active / mem.total) * 100,
                disk: rootDisk ? rootDisk.use : 0,
                temp: temp.main || 0,
            };

            logger.info({ stat }, '[MonitoringService] Processed host stat');

            const history = await RedisService.getCache<HostStat[]>(this.HOST_HISTORY_KEY) || [];
            history.push(stat);
            const oneDayAgo = timestamp - (24 * 60 * 60 * 1000);
            const filteredHistory = history.filter(h => h.timestamp > oneDayAgo);

            await RedisService.setCache(this.HOST_HISTORY_KEY, filteredHistory, this.HISTORY_TTL);
            logger.info({ historyLength: filteredHistory.length }, '[MonitoringService] Saved host stats to Redis');
        } catch (error) {
            logger.error({ error: error.message, stack: error.stack }, '[MonitoringService] Error collecting host stats');
        }
    }

    private async processServiceStats(id: string, serviceName: string, timestamp: number): Promise<void> {
        try {
            const stats = await SwarmService.getServiceStats(serviceName);
            const stat: ServiceStat = {
                timestamp,
                cpu: stats.cpu,
                memory: stats.memory,
                replicas: stats.replicas,
            };

            const key = `${this.HISTORY_KEY_PREFIX}${id}`;
            const history = await RedisService.getCache<ServiceStat[]>(key) || [];

            // Keep only last 24h (assuming 5min interval, that's 288 points)
            history.push(stat);
            const oneDayAgo = timestamp - (24 * 60 * 60 * 1000);
            const filteredHistory = history.filter(h => h.timestamp > oneDayAgo);

            await RedisService.setCache(key, filteredHistory, this.HISTORY_TTL);
        } catch (error) {
            logger.error({ serviceName, error: error.message }, '[MonitoringService] Error processing stats');
        }
    }

    async getMonitoringData(): Promise<{ services: ServiceStatus[], host: HostStatus | null }> {
        const services: ServiceStatus[] = [];

        // 1. Global Apps
        const apps = this.getGlobalApps();
        for (const appName of apps) {
            services.push(await this.getServiceStatus(appName, appName, 'app'));
        }

        // 2. Themes
        const themes = await Theme.query().where('is_active', true);
        for (const theme of themes) {
            services.push(await this.getServiceStatus(theme.id, `theme_${theme.id}`, 'theme', theme.name));
        }

        // 3. Stores
        const stores = await Store.query().where('is_active', true);
        for (const store of stores) {
            services.push(await this.getServiceStatus(store.id, `api_store_${store.id}`, 'store', store.name));
        }

        // 4. Host Status
        const host = await this.getHostStatus();

        return { services, host };
    }

    private async getHostStatus(): Promise<HostStatus | null> {
        try {
            const [os, cpu, history] = await Promise.all([
                si.osInfo(),
                si.cpu(),
                RedisService.getCache<HostStat[]>(this.HOST_HISTORY_KEY),
            ]);

            const current = history && history.length > 0 ? history[history.length - 1] : {
                timestamp: Date.now(),
                cpu: 0,
                memory: 0,
                disk: 0,
                temp: 0,
            };

            return {
                os: {
                    platform: os.platform,
                    distro: os.distro,
                    release: os.release,
                },
                uptime: si.time().uptime,
                cpu: {
                    manufacturer: cpu.manufacturer,
                    brand: cpu.brand,
                    cores: cpu.cores,
                },
                current,
                history: history || [],
            };
        } catch (error) {
            logger.error({ error: error.message }, '[MonitoringService] Error getting host status');
            return null;
        }
    }

    private async getServiceStatus(id: string, serviceName: string, type: 'app' | 'theme' | 'store', displayName?: string): Promise<ServiceStatus> {
        const key = `${this.HISTORY_KEY_PREFIX}${id}`;
        const history = await RedisService.getCache<ServiceStat[]>(key) || [];
        const current = history.length > 0 ? history[history.length - 1] : { timestamp: Date.now(), cpu: 0, memory: 0, replicas: 0 };

        let status: 'running' | 'stopped' | 'error' = 'stopped';
        if (current.replicas > 0) {
            status = 'running';
        }

        return {
            id,
            name: displayName || serviceName,
            type,
            status,
            current,
            history,
        };
    }
}

export default new MonitoringService();
