import router from '@adonisjs/core/services/router'
import StoresController from '#controllers/stores_controller';
import AuthController from '#controllers/auth_controller';
import UpdatesController from '#controllers/updates_controller';
import { env } from 'node:process';


// Auth
router.post('/register', [AuthController, 'register'])
router.post('/login', [AuthController, 'login'])
router.post('/logout', [AuthController, 'logout'])
router.post('/global_logout', [AuthController, 'logout'])
router.get('/me', [AuthController, 'me'])
router.put('/update', [AuthController, 'update'])
router.delete('/delete_account', [AuthController, 'delete_account'])

// Store
router.post('/create_store', [StoresController, 'create_store'])
router.get('/get_stores', [StoresController, 'get_stores'])
router.put('/update_store/', [StoresController, 'update_store'])
router.delete('/delete_store/:id', [StoresController, 'delete_store'])
// Store
router.put('/start_store/:id', [StoresController, 'start_store'])
router.put('/stop_store/:id', [StoresController, 'stop_store'])
router.put('/reload_store/:id', [StoresController, 'reload_store'])
router.put('/test_store/:id', [StoresController, 'test_store'])
// Sotre Domaine 
router.post('/add_store_domaine', [StoresController, 'add_store_domaine'])
router.post('/remove_store_domaine', [StoresController, 'remove_store_domaine'])

// API Manager
router.post('/api/update', [UpdatesController, 'handle'])





router.get('/', async ({  }) => {
    return env
})


























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