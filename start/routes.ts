import router from '@adonisjs/core/services/router'
import StoresController from '#controllers/stores_controller';
import AuthController from '#controllers/auth_controller';
import UpdatesController from '#controllers/updates_controller';
import { env } from 'node:process';
import ThemesController from '#controllers/themes_controller';
import AdminControlsController from '#controllers/admin_controls_controller';
import { testRedis } from '#controllers/StoreTools/Teste';
import { InspectDockerAllApi } from '#controllers/StoreTools/Docker';
import { newContainerName } from '#controllers/Utils/functions';


// Auth
router.post('/register', [AuthController, 'register'])
router.post('/login', [AuthController, 'login'])
router.post('/logout', [AuthController, 'logout'])
router.post('/global_logout', [AuthController, 'logout'])
router.get('/me', [AuthController, 'me'])
router.put('/edit_me', [AuthController, 'edit_me'])
router.delete('/delete_account', [AuthController, 'delete_account'])

// Store
router.post('/create_store', [StoresController, 'create_store'])
router.get('/get_stores', [StoresController, 'get_stores'])
router.put('/update_store/', [StoresController, 'update_store'])
router.delete('/delete_store/:id', [StoresController, 'delete_store'])
// Store
router.put('/start_store/:id', [StoresController, 'start_store']);
router.put('/stop_store/:id', [StoresController, 'stop_store']);
router.put('/reload_store/:id', [StoresController, 'reload_store']);
router.put('/test_store/:id', [StoresController, 'test_store']);
router.get('available_name',[StoresController,'available_name']);
// Sotre Domaine 
router.post('/add_store_domaine', [StoresController, 'add_store_domaine'])
router.post('/remove_store_domaine', [StoresController, 'remove_store_domaine'])

// API Manager
router.post('/api/update', [UpdatesController, 'handle'])

// Server Admin Manager
router.post('/init_server',[AdminControlsController,'init_server']);

//Theme
router.post('/create_theme', [ThemesController, 'create_theme'])
router.get('/get_themes', [ThemesController, 'get_themes'])
router.put('/update_theme/', [ThemesController, 'update_theme'])
router.delete('/delete_theme/:id', [ThemesController, 'delete_theme'])





router.get('/', async ({  }) => {
    return env
})



// deletePermissions({groups:['g_888dbcca'],users:['u_888dbcca']})


// updateNginxServer()



// testRedis('71743c6a-ac00-45bc-9617-4be635212923') 

// InspectDockerAllApi()




// const server_user = env.get('SERVER_USER');
// try {
//     console.log(`🔹 Création de l'utilisateur: ${server_user}`)
//     await execa('sudo', ['adduser', '-u', '1110', server_user, '--disabled-password', '--gecos', '""'])
//     console.log(`✅ Utilisateur cree pour ${server_user}`)

// } catch (error) {
//     console.log(`❌ Error : Création de l'utilisateur: ${server_user}`, error.stderr)
// }

// const dir = '/volumes/api/'
// try {
//     console.log(`🔹 Volume Tester`)
//     const cmd = await execa('sudo', ['ls','-l',dir])
//     console.log(`✅ Volume is ok`,cmd)

// } catch (error) {
//     console.log(`❌ Error : Lors du test du volume ${'/volumes/api/'}`, error)
// }