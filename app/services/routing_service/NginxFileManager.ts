// s_server/app/services/routing_service/NginxFileManager.ts
import fs from 'fs/promises';
import path from 'path';

import { Logs } from '../../Utils/functions.js';
import { ensureNginxDirsExistInContainer, getAvailableConfigPath, getEnabledConfigPath } from './utils.js';
import { execa } from 'execa';
import env from '#start/env';

export class NginxFileManager {
    constructor(private logs: Logs) {} // Permet de passer une instance de Logs pour le contexte

    /**
     * Écrit un fichier de configuration Nginx.
     * @param filename Nom du fichier (ex: "100-store-xyz.conf")
     * @param content Contenu du fichier
     * @returns boolean Succès de l'écriture
     */
    async writeConfigFile(filename: string, content: string): Promise<boolean> {
        if (!await ensureNginxDirsExistInContainer(this.logs)) return false;
        const filePath = getAvailableConfigPath(filename);
        this.logs.log(`📝 Écriture du fichier de configuration Nginx : ${filePath}`);
        try {
            await execa('tee', [filePath], { input: content })
            
            this.logs.log(`✅ Fichier ${filename} écrit avec succès.`);
            return true;
        } catch (error) {
            delete error.stdout
            delete error.stdio
            this.logs.notifyErrors(`❌❌❌❌❌❌==>>>> Erreur lors de l'écriture du fichier ${filePath}`, { filename },env.get('NODE_ENV')=='production'?error.sdterr:error );
            return false;
        }
    }

    /**
     * Active une configuration Nginx en créant un lien symbolique.
     * @param filename Nom du fichier de configuration dans sites-available (ex: "100-store-xyz.conf")
     * @returns boolean Succès de la création du lien
     */
    async enableConfig(filename: string): Promise<boolean> {
        if (!await ensureNginxDirsExistInContainer(this.logs)) return false;
        const sourcePath = getAvailableConfigPath(filename);
        const linkPath = getEnabledConfigPath(filename);

        this.logs.log(`🔗 Activation de la configuration ${filename} (lien de ${linkPath} vers ${sourcePath})`);
        try {
            // Vérifier si le fichier source existe
            await fs.access(sourcePath);
        } catch (error) {
            this.logs.notifyErrors(`❌ Fichier source ${sourcePath} non trouvé pour l'activation.`, { filename }, error);
            return false;
        }

        try {
            // Supprimer l'ancien lien s'il existe
            try {
                await fs.unlink(linkPath);
                this.logs.log(`   -> Ancien lien ${linkPath} supprimé.`);
            } catch (unlinkError: any) {
                if (unlinkError.code !== 'ENOENT') throw unlinkError; // Relance si ce n'est pas "fichier non trouvé"
            }
            // Créer le nouveau lien symbolique
            // path.relative donne le chemin relatif de linkPath vers sourcePath
            const relativeSourcePath = path.relative(path.dirname(linkPath), sourcePath);
            await fs.symlink(relativeSourcePath, linkPath);
            this.logs.log(`✅ Configuration ${filename} activée.`);
            return true;
        } catch (error) {
            this.logs.notifyErrors(`❌ Erreur lors de l'activation de la configuration ${filename}`, { filename }, error);
            return false;
        }
    }

    /**
     * Désactive une configuration Nginx en supprimant son lien symbolique.
     * @param filename Nom du fichier de configuration (ex: "100-store-xyz.conf")
     * @returns boolean Succès de la suppression du lien
     */
    async disableConfig(filename: string): Promise<boolean> {
        if (!await ensureNginxDirsExistInContainer(this.logs)) return false; // Bien que non strictement nécessaire pour unlink
        const linkPath = getEnabledConfigPath(filename);
        this.logs.log(`🗑️ Désactivation de la configuration ${filename} (suppression du lien ${linkPath})`);
        try {
            await fs.unlink(linkPath);
            this.logs.log(`✅ Configuration ${filename} désactivée.`);
            return true;
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                this.logs.log(`ℹ️ Lien ${linkPath} déjà inexistant.`);
                return true; // Considéré comme un succès si déjà supprimé
            }
            this.logs.notifyErrors(`❌ Erreur lors de la désactivation de la configuration ${filename}`, { filename }, error);
            return false;
        }
    }

    /**
     * Supprime un fichier de configuration de sites-available.
     * @param filename Nom du fichier (ex: "100-store-xyz.conf")
     * @returns boolean Succès de la suppression
     */
    async deleteConfigFile(filename: string): Promise<boolean> {
        if (!await ensureNginxDirsExistInContainer(this.logs)) return false; // Non strictement nécessaire pour unlink
        const filePath = getAvailableConfigPath(filename);
        this.logs.log(`🗑️ Suppression du fichier de configuration ${filePath}`);
        try {
            await fs.unlink(filePath);
            this.logs.log(`✅ Fichier ${filename} supprimé de sites-available.`);
            return true;
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                this.logs.log(`ℹ️ Fichier ${filePath} déjà inexistant.`);
                return true;
            }
            this.logs.notifyErrors(`❌ Erreur lors de la suppression du fichier ${filePath}`, { filename }, error);
            return false;
        }
    }

    /**
     * Supprime complètement une configuration (fichier dans available et lien dans enabled).
     * @param filename Nom du fichier de configuration
     * @returns boolean Succès global
     */
    async removeFullConfig(filename: string): Promise<boolean> {
        const disabled = await this.disableConfig(filename);
        const deleted = await this.deleteConfigFile(filename);
        return disabled && deleted; // Succès si les deux opérations réussissent (ou étaient déjà dans l'état désiré)
    }
}