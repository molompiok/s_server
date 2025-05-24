// s_server/app/middleware/auth_middleware.ts
import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
// import type { Authenticators } from '@adonisjs/auth/types'
import JwtService from '#services/JwtService' // Le JwtService de s_server (avec clé privée et publique)
import User from '#models/user'               // Le modèle User de s_server
import { Authenticators } from '@adonisjs/auth/types';


interface ServerJwtPayload {
  userId: string;
  email: string;
  // roles_globaux?: string[];
  sub: string;
  iss: string;
  aud: string;
  iat: number;
  exp: number;
}
/**
 * Auth middleware is used authenticate HTTP requests and deny
 * access to unauthenticated users.
 */
export default class AuthMiddleware {
  /**
   * The URL to redirect to, when authentication fails
   */
  redirectTo = '/login'

  async handle(
    ctx: HttpContext,
    next: NextFn,
    _options: {
      guards?: (keyof Authenticators)[]
    } = {}
  ) {
   
    try {
      await ctx.auth.use('jwt').authenticate();
    } catch (error) {
      return ctx.response.unauthorized({ message: 'Unauthorized access' });
    } 
    
    
    // await ctx.auth.authenticateUsing(options.guards, { loginRoute: this.redirectTo })
    return next()
  }
}