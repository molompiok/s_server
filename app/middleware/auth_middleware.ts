// s_server/app/middleware/auth_middleware.ts
import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import { Authenticators } from '@adonisjs/auth/types';
import { Bouncer } from '@adonisjs/bouncer' // Importer Bouncer
import { policies } from '#policies/main'    // Importer tes policies
import * as abilities from '#abilities/main' // Importer tes abilities

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

    ctx.bouncer = new Bouncer(
      () => ctx.auth.user || null,
      abilities, // Tes abilities de s_server
      policies   // Tes policies de s_server
    ).setContainerResolver(ctx.containerResolver);

    if ('view' in ctx) {
      // @ts-ignore
      ctx.view.share(ctx.bouncer.edgeHelpers);
    }
    return next()
  }
}