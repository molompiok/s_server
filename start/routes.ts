import router from '@adonisjs/core/services/router'
import StoresController from '../app/controllers/stores_controller.js';
// import AuthController from '../app/controllers/auth_controller.js';
// import UpdatesController from '../app/controllers/updates_controller.js';
import { env } from 'node:process';
import ThemesController from '../app/controllers/themes_controller.js';
import AdminControlsController from '../app/controllers/admin_controller.js';
// import ApiController from '../app/controllers/api_controller.js';


// Auth
// router.post('/register', [AuthController, 'register'])
// router.post('/login', [AuthController, 'login'])
// router.post('/logout', [AuthController, 'logout'])
// router.post('/global_logout', [AuthController, 'logout'])
// router.get('/me', [AuthController, 'me'])
// router.put('/edit_me', [AuthController, 'edit_me'])
// router.delete('/delete_account', [AuthController, 'delete_account'])

// Store change
router.post('/create_store', [StoresController, 'create_store'])
router.put('/update_store/', [StoresController, 'update_store'])
router.put('change_store_theme/:id',[StoresController,'change_store_theme']);
router.put('/change_store_api/:id', [StoresController, 'change_store_api'])
//Store get
router.get('/get_stores', [StoresController, 'get_stores'])
router.get('/get_store', [StoresController, 'get_store'])
router.get('available_name',[StoresController,'available_name']);
router.get('can_manage_store',[StoresController,'can_manage_store']);
//Store Domaine 
router.put('/add_store_domain/', [StoresController, 'add_store_domain'])
router.put('/remove_store_domain/', [StoresController, 'remove_store_domain'])
// Store Pilote
router.put('/scale_store/', [StoresController, 'scale_store'])
router.put('/stop_store/:id', [StoresController, 'stop_store']);
router.put('/start_store/:id', [StoresController, 'start_store']);
router.put('/restart_store/:id', [StoresController, 'restart_store']);
// Store delete
router.delete('/delete_store/:id', [StoresController, 'delete_store'])


// Server Admin Manager
router.post('/garbage_collect_dirs',[AdminControlsController,'garbage_collect_dirs']);
router.post('/global_status',[AdminControlsController,'global_status']);
router.post('/refresh_nginx_configs',[AdminControlsController,'refresh_nginx_configs']);
router.post('/restart_all_services',[AdminControlsController,'restart_all_services']);


//Theme Change
router.post('/upsert_theme', [ThemesController, 'upsert_theme'])
router.put('/update_theme_version/:id', [ThemesController, 'update_theme_version']);
router.put('/update_theme_status/:id', [ThemesController, 'update_theme_status']);
//Theme Get
router.get('/get_themes', [ThemesController, 'get_themes'])
router.get('/get_theme/', [ThemesController, 'get_theme'])
//Theme Pilote
router.put('/stop_theme/:id', [ThemesController, 'stop_theme']);
router.put('/start_theme/:id', [ThemesController, 'start_theme']);
router.put('/restart_theme/:id', [ThemesController, 'restart_theme']);
//Theme delete
router.delete('/delete_theme/:id', [ThemesController, 'delete_theme'])

//Api
// router.post('/create_api', [ApiController, 'create_api'])
// router.get('/get_apis', [ApiController, 'get_apis'])
// router.put('/update_api/', [ApiController, 'update_api'])
// router.delete('/delete_api/:id', [ApiController, 'delete_api'])

router.get('/', async ({  }) => {
    return env
}) 


router.get('/fs/*',({request, response})=>{

    return response.download('.'+request.url())
})
 