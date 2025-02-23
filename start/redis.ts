// import Redis from 'ioredis'

// // Connexion au serveur Redis
// //@ts-ignore
// const redisSender = new Redis({
//   host: '127.0.0.1',
//   port: 6379,
// })

// await redisSender.publish('api-channel', JSON.stringify({ event: 'update', data:'text' }));

// ////////////////////////////////////
// //@ts-ignore
// const rediSubscriber = new Redis()

// rediSubscriber.subscribe('server-channel', (err:any, count:any) => {
//   if (err) {
//     console.error('Erreur d’abonnement à Redis:', err)
//   } else {
//     console.log(`Abonné à ${count} canal(aux)`)
//   }
// })

// rediSubscriber.on('message', (channel:string, message:string) => {
//   console.log(`Message reçu sur ${channel}:`, JSON.parse(message))
// })


// export {redisSender, rediSubscriber}


// ////////////////////////////////////
// import { Queue } from 'bullmq'

// const queue = new Queue('api-queue', {
//     connection: {
//       host: '127.0.0.1',
//       port: 6379,
//     },
//   })
  
//   async function addJob() {
//     await queue.add('process-data', { id: 123, name: 'Test' })
//   }
//   addJob()
//   ///////////////////////////
//   import { Worker } from 'bullmq'

// const _worker = new Worker(
//   'server-queue',
//   async (job) => {
//     // console.log('Processing job:', job.)
//     // Traitement des données...
//   },
//   {
//     connection: {
//       host: '127.0.0.1',
//       port: 6379,
//     },
//   }
// )