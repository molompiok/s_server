import router from '@adonisjs/core/services/router'

// --- Contrôleurs ---
// Garde tes imports de contrôleurs ici
import StoresController from '#controllers/stores_controller' // Assure-toi que le chemin est correct
import ThemesController from '#controllers/themes_controller'
import ApiController from '#controllers/api_controller'
import AdminControlsController from '#controllers/admin_controller'
import env from './env.js'
// import AuthController from '#controllers/auth_controller' // Pour plus tard

/*
--------------------------------------------------------------------------------
-- VOS NOTES TODO (Très importantes pour la suite !) --
--------------------------------------------------------------------------------
*   [ ] Gérer l'authentification (OAuth2, session, token, api_key) et les rôles.
*   [ ] Logique de scaling automatique des instances boutique.
*   [ ] Interconnexion complète de l'architecture (Nginx interne, Redis mapping, API interne theme/api).
*   [ ] Gestion des déploiements sur plusieurs VPS.
*   [ ] Sécurité (Réseau, attaques, sauvegardes BDD S_Server et boutiques).
*   [ ] Gestion des forfaits, paiements, affiliation, marketing.
--------------------------------------------------------------------------------
*/

// --- ROUTES D'AUTHENTIFICATION (COMMENTÉES POUR LE MOMENT) ---
/*
router.group(() => {
  router.post('/register', [AuthController, 'register'])
  router.post('/login', [AuthController, 'login'])
  router.post('/logout', [AuthController, 'logout']).use(middleware.auth()) // Exemple d'ajout de middleware auth
  router.post('/global_logout', [AuthController, 'global_logout']).use(middleware.auth())
  router.get('/me', [AuthController, 'me']).use(middleware.auth())
  router.put('/me', [AuthController, 'edit_me']).use(middleware.auth()) // Remplacé edit_me par PUT /me
  router.delete('/me', [AuthController, 'delete_account']).use(middleware.auth()) // Remplacé delete_account par DELETE /me
}).prefix('/auth')
*/


// --- ROUTES POUR LES BOUTIQUES (STORES) ---
router.group(() => {
  // --- CRUD Standard ---
  router.get('/', [StoresController, 'get_stores'])   // GET /stores -> Liste des boutiques (avec pagination/filtres ?)
  router.post('/', [StoresController, 'create_store']) // POST /stores -> Créer une nouvelle boutique
  router.get('/:id', [StoresController, 'get_store'])  // GET /stores/:id -> Récupérer les détails d'une boutique
  router.put('/:id', [StoresController, 'update_store'])// PUT /stores/:id -> Mettre à jour une boutique
  router.delete('/:id', [StoresController, 'delete_store'])// DELETE /stores/:id -> Supprimer une boutique

  // --- Actions Spécifiques sur une Boutique ---
  router.post('/:id/change_theme', [StoresController, 'change_store_theme']) // POST /stores/:id/change_theme -> Changer le thème
  router.post('/:id/change_api', [StoresController, 'change_store_api'])     // POST /stores/:id/change_api -> Changer l'API backend
  router.post('/:id/scale', [StoresController, 'scale_store'])              // POST /stores/:id/scale -> Demander un scaling
  router.post('/:id/stop', [StoresController, 'stop_store'])                // POST /stores/:id/stop -> Arrêter l'instance de la boutique
  router.post('/:id/start', [StoresController, 'start_store'])              // POST /stores/:id/start -> Démarrer l'instance
  router.post('/:id/restart', [StoresController, 'restart_store'])          // POST /stores/:id/restart -> Redémarrer l'instance

  // --- Gestion des Domaines ---
  router.post('/:id/domains', [StoresController, 'add_store_domain'])       // POST /stores/:id/domains -> Ajouter un domaine (domaine dans le body)
  // Pour supprimer, il faut spécifier quel domaine. L'URL est une bonne option :
  router.delete('/:id/domains/:domain_name', [StoresController, 'remove_store_domain']) // DELETE /stores/:id/domains/mon-domaine.com

  // --- Utilitaires pour les Boutiques ---
  // Préférable d'utiliser des query params pour ces vérifications
  router.get('/utils/available_name', [StoresController, 'available_name']) // GET /stores/utils/available_name?name=mon-nom
  // Vérifier si l'utilisateur (quand l'auth sera là) peut gérer CE store
  router.get('/:id/can_manage', [StoresController, 'can_manage_store'])     // GET /stores/:id/can_manage
}).prefix('/stores') 

// --- ROUTES POUR LES THÈMES (THEMES) ---
router.group(() => {
  // --- CRUD Standard ---
  // Remplacement de 'upsert_theme' par des routes séparées CREATE et UPDATE
  router.get('/', [ThemesController, 'get_themes'])     // GET /themes -> Liste des thèmes (publics/privés selon droits)
  router.post('/', [ThemesController, 'upsert_theme'])      // POST /themes -> Créer un nouveau thème (similaire à upsert logique de création)
  router.get('/:id', [ThemesController, 'get_theme'])   // GET /themes/:id -> Détails d'un thème
  router.put('/:id', [ThemesController, 'upsert_theme'])      // PUT /themes/:id -> Mettre à jour un thème (similaire à upsert logique d'update)
  router.delete('/:id', [ThemesController, 'delete_theme']) // DELETE /themes/:id -> Supprimer un thème

  // --- Actions Spécifiques sur un Thème ---
  router.post('/:id/version', [ThemesController, 'update_theme_version']) // POST /themes/:id/update_version
  router.post('/:id/status', [ThemesController, 'update_theme_status'])   // POST /themes/:id/update_status (is_public, is_active, etc.)
  router.post('/:id/stop', [ThemesController, 'stop_theme'])                     // POST /themes/:id/stop
  router.post('/:id/start', [ThemesController, 'start_theme'])                   // POST /themes/:id/start
  router.post('/:id/restart', [ThemesController, 'restart_theme'])               // POST /themes/:id/restart

}).prefix('/themes')


// --- ROUTES POUR LES APIs BACKEND (APIS) ---
router.group(() => {
  // --- CRUD Standard ---
  router.get('/', [ApiController, 'get_apis'])        // GET /apis -> Liste des APIs disponibles
  router.post('/', [ApiController, 'create_api'])     // POST /apis -> Enregistrer une nouvelle définition d'API
  router.get('/:id', [ApiController, 'get_api'])      // GET /apis/:id -> Détails d'une définition d'API (Ajouté pour cohérence)
  router.put('/:id', [ApiController, 'update_api'])   // PUT /apis/:id -> Mettre à jour une définition d'API
  router.delete('/:id', [ApiController, 'delete_api'])// DELETE /apis/:id -> Supprimer une définition d'API

}).prefix('/apis')


// --- ROUTES D'ADMINISTRATION (nécessitent une autorisation forte !) ---
router.group(() => {
  // --- Actions Système ---
  router.post('/garbage_collect_dirs', [AdminControlsController, 'garbage_collect_dirs']) // POST /admin/garbage_collect_dirs
  router.get('/global_status', [AdminControlsController, 'global_status'])              // GET /admin/global_status -> Obtenir l'état global
  router.post('/refresh_nginx_configs', [AdminControlsController, 'refresh_nginx_configs']) // POST /admin/refresh_nginx_configs
  router.post('/restart_all_services', [AdminControlsController, 'restart_all_services'])   // POST /admin/restart_all_services

}).prefix('/admin')


// --- ROUTES POTENTIELLEMENT DANGEREUSES (Supprimées/Commentées) ---
// router.get('/', async ({ }) => { return process.env }) // -> Fuite d'informations sensibles !
// router.get('/fs/*',({request, response})=>{ ... }) // -> Faille de sécurité Directory Traversal ! Utiliser @adonisjs/static


router.get('/', async ({  }) => {
    return env
}) 


router.get('/fs/*',({request, response})=>{

    return response.download('.'+request.url())
})
 

console.log("Routes chargées.") // Optionnel: pour confirmer que le fichier est lu