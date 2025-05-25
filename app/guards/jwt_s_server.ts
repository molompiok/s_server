//app/guards/jwt_s_server.ts
import type { HttpContext } from '@adonisjs/core/http'
import { symbols, errors } from '@adonisjs/auth'
import type { AuthClientResponse, GuardContract } from '@adonisjs/auth/types'
import JwtService from '#services/JwtService'
import RedisService from '#services/RedisService'

interface ServerJwtPayload {
  userId: string;
  email: string;
  sub: string;
  iss: string;
  aud: string;
  iat: number;
  exp: number;
}

export type JwtGuardUser<RealUser> = {
  getId(): string | number | BigInt
  getOriginal(): RealUser
}

export interface JwtUserProviderContract<RealUser> {
  [symbols.PROVIDER_REAL_USER]: RealUser
  createUserForGuard(user: RealUser): Promise<JwtGuardUser<RealUser>>
  findById(identifier: string | number | BigInt): Promise<JwtGuardUser<RealUser> | null>
}

export type JwtGuardOptions = {
  expiresIn?: string // optionnel pour expiration
}

export class JwtGuard<UserProvider extends JwtUserProviderContract<unknown>>
  implements GuardContract<UserProvider[typeof symbols.PROVIDER_REAL_USER]> {

  #ctx: HttpContext
  #userProvider: UserProvider
  #options: JwtGuardOptions

  driverName: 'jwt' = 'jwt'
  authenticationAttempted = false
  isAuthenticated = false
  user?: UserProvider[typeof symbols.PROVIDER_REAL_USER]
  declare [symbols.GUARD_KNOWN_EVENTS]: {}

  constructor(ctx: HttpContext, userProvider: UserProvider, options: JwtGuardOptions) {
    this.#ctx = ctx
    this.#userProvider = userProvider
    this.#options = options
  }

  async generate(user: UserProvider[typeof symbols.PROVIDER_REAL_USER]) {
    const providerUser = await this.#userProvider.createUserForGuard(user)
    const token = JwtService.sign(
      { userId: providerUser.getId() },
      {
        expiresIn: this.#options.expiresIn as number | undefined
      }
    )
    return {
      type: 'bearer',
      token,
    }
  }

  async authenticate(): Promise<UserProvider[typeof symbols.PROVIDER_REAL_USER]> {
    if (this.authenticationAttempted) return this.getUserOrFail()
    this.authenticationAttempted = true

    const authHeader = this.#ctx.request.header('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new errors.E_UNAUTHORIZED_ACCESS('Unauthorized access', {
        guardDriverName: this.driverName,
      })
    }

    const token = authHeader.replace('Bearer ', '').trim()

    const isBlacklisted = await RedisService.getCache(`jwt_blacklist:${token}`)
    if (isBlacklisted) {
      throw new errors.E_UNAUTHORIZED_ACCESS('Token has been revoked', {
        guardDriverName: 'jwt',
      })
    }

    let payload: ServerJwtPayload
    try {
      payload = JwtService.verify<ServerJwtPayload>(token)
    } catch {
      throw new errors.E_UNAUTHORIZED_ACCESS('Invalid or expired token', {
        guardDriverName: this.driverName,
      })
    }

    if (!payload || typeof payload !== 'object' || !payload.userId) {
      throw new errors.E_UNAUTHORIZED_ACCESS('Invalid token payload', {
        guardDriverName: this.driverName,
      })
    }

    const revoked_date = await RedisService.getCache(`revoked_all_token_at:${payload.userId}`);
    console.log({ payload }, payload.iat, revoked_date, payload.iat < revoked_date, Date.now());
    if ( payload.iat  < (revoked_date || 0)) {
      console.log('REVOKED TOKEN, ');
      console.log('REVOKED TOKEN (issued before global revocation)');
      throw new errors.E_UNAUTHORIZED_ACCESS('Token has been revoked globally', {
        guardDriverName: 'jwt',
      });

    }

    const providerUser = await this.#userProvider.findById(payload.userId)
    if (!providerUser) {
      throw new errors.E_UNAUTHORIZED_ACCESS('User not found for token', {
        guardDriverName: this.driverName,
      });
    }

    this.user = providerUser.getOriginal()
    this.isAuthenticated = true
    return this.getUserOrFail();
  }

  async check(): Promise<boolean> {
    try {
      await this.authenticate()
      return true
    } catch {
      return false
    }
  }

  getUserOrFail(): UserProvider[typeof symbols.PROVIDER_REAL_USER] {

    if (!this.user) {
      throw new errors.E_UNAUTHORIZED_ACCESS('Unauthorized access', {
        guardDriverName: this.driverName,
      })
    }
    return this.user
  }

  async authenticateAsClient(
    user: UserProvider[typeof symbols.PROVIDER_REAL_USER]
  ): Promise<AuthClientResponse> {
    const token = await this.generate(user)
    return {
      headers: {
        authorization: `Bearer ${token.token}`,
      },
    }
  }

  async logoutAll() {
    const user = await this.authenticate();
    await RedisService.setCache(`revoked_all_token_at:${(user as any).id}`, Date.now()/1000, 8 * 24 * 60 * 60)
    await this.logout()
  }
  async logout() {
    const header = this.#ctx.request.header('authorization')
    const [, token] = header?.split('Bearer ') ?? []

    if (!token) {
      throw new errors.E_UNAUTHORIZED_ACCESS('Token is missing', {
        guardDriverName: 'jwt',
      })
    }

    try {
      const payload = JwtService.verify<ServerJwtPayload>(token); // Vérifier pour obtenir l'expiration
      const expiresInSeconds = payload.exp - Math.floor(Date.now() / 1000);
      if (expiresInSeconds > 0) {
        await RedisService.setCache(`jwt_blacklist:${token}`, 'revoked', expiresInSeconds);
      }
    } catch (e) {
      // Token déjà invalide/expiré, pas besoin de le blacklister ou utiliser un TTL par défaut
      await RedisService.setCache(`jwt_blacklist:${token}`, 'revoked', 1 * 60 * 60 * 24); // Fallback 1 jour
    }

  }
}
