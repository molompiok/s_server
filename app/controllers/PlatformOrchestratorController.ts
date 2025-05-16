// s_server/app/controllers/http/platform_orchestrator_controller.ts
import type { HttpContext } from '@adonisjs/core/http'
import PlatformOrchestratorService from '#services/PlatformOrchestratorService'
import { CHECK_ROLES } from '#abilities/main';
// import { CHECK_ROLES } from '#abilities/main' // Pour vérifier si Admin

export default class PlatformOrchestratorController {
    async synchronize({ response, auth, bouncer }: HttpContext) {
        // Vérifier les droits (Admin seulement)
        const user = await auth.authenticate();
        if (!CHECK_ROLES.isAdmin(user)) {
            return response.forbidden({ message: "Action réservée aux administrateurs." });
        }
        await bouncer.allows('performDangerousAdminActions')

        // Lancer en arrière-plan pour ne pas bloquer la requête HTTP trop longtemps
        PlatformOrchestratorService.synchronizePlatformState()
            .catch(err => console.error("Erreur asynchrone lors de la synchronisation manuelle:", err));

        return response.accepted({ message: "Synchronisation de la plateforme initiée en arrière-plan." });
    }
}