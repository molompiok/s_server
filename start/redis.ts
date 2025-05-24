// // s_server/app/middleware/auth_middleware.ts
// import type { HttpContext } from '@adonisjs/core/http'
// import type { NextFn } from '@adonisjs/core/types/http'
// import JwtService from '#services/JwtService' // Le JwtService de s_server (avec clé privée et publique)
// import User from '#models/user'               // Le modèle User de s_server
// import { Bouncer } from '@adonisjs/bouncer'   // Importer Bouncer
// import { policies } from '#policies/main'      // Importer tes policies de s_server
// import * as abilities from '#abilities/main'   // Importer tes abilities de s_server

// // Interface pour le payload attendu du JWT (identique à celle de s_api pour la partie commune)
// interface ServerJwtPayload {
//   userId: string;
//   email: string;
//   // roles_globaux?: string[];
//   sub: string;
//   iss: string;
//   aud: string;
//   iat: number;
//   exp: number;
// }

// export default class AuthMiddlewareServer { // Renommé pour éviter confusion si tu copies des fichiers
//   // redirectTo n'est généralement pas utilisé pour une API pure
//   // redirectTo = '/login';

//   async handle(ctx: HttpContext, next: NextFn) {
//     let isAuthenticated = false;
//     let authUser: User | null = null;

//     const authHeader = ctx.request.header('Authorization');
//     if (authHeader && authHeader.startsWith('Bearer ')) {
//       const token = authHeader.substring(7);
//       try {
//         // Utiliser JwtService de s_server pour vérifier un token qu'il a lui-même émis.
//         // Il utilisera sa clé publique (ou privée si jwt.verify le permet pour les tokens signés par soi-même)
//         const payload = JwtService.verify<ServerJwtPayload>(token);

//         // Vérifications du payload (issuer, audience)
//         // L'audience ici serait celle que s_server a mise dans le token, ex: dash.sublymus.com
//         if (payload.iss !== 'https://server.sublymus.com') { // Doit correspondre à ce que s_server a émis
//           throw new Error('Invalid JWT issuer for s_server token');
//         }
//         // Optionnel: if (payload.aud !== 'https://dash.sublymus.com' && payload.aud !== 'AUTRE_AUDIENCE_POUR_S_SERVER') {
//         //   throw new Error('Invalid JWT audience for s_server token');
//         // }

//         // Charger l'utilisateur de la base de données de s_server
//         const userFromJwt = await User.find(payload.userId); // Ou payload.sub

//         if (userFromJwt) {
//           authUser = userFromJwt;
//           isAuthenticated = true;
//           ctx.logger.info({ userId: authUser.id, guard: 'jwt_s_server_internal' }, 'User authenticated on s_server via JWT');
//         } else {
//           ctx.logger.warn({ jwtPayloadUserId: payload.userId }, 'User ID from JWT not found in s_server database');
//           // Token valide, mais l'utilisateur n'existe plus ? C'est une situation d'erreur.
//           throw new Error('User from valid token not found');
//         }

//       } catch (jwtError) {
//         ctx.logger.warn({ error: jwtError.message }, 's_server JWT validation failed or token missing/invalid');
//         // L'erreur sera capturée ci-dessous si isAuthenticated reste false
//       }
//     } else {
//         ctx.logger.info('Authorization header missing or not Bearer for s_server');
//     }

//     if (!isAuthenticated || !authUser) {
//       return ctx.response.unauthorized({ message: 'Unauthorized access to s_server resource' });
//     }

//     // Attribuer l'utilisateur authentifié à ctx.auth.user
//     ctx.auth.user = authUser;

//     // Initialiser Bouncer pour s_server
//     ctx.bouncer = new Bouncer(
//       () => ctx.auth.user || null,
//       abilities, // abilities spécifiques à s_server
//       policies   // policies spécifiques à s_server
//     ).setContainerResolver(ctx.containerResolver);

//     if ('view' in ctx) {
//       // @ts-ignore
//       ctx.view.share(ctx.bouncer.edgeHelpers);
//     }

//     await next();
//   }
// }