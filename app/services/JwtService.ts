// start/services/JwtService.ts
import env from '#start/env'
import jwt from 'jsonwebtoken'
import fs from 'fs'
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
const key_path = env.get('S_SERVER_KEYS_CONTAINER_PATH')

const PRIVATE_KEY = fs.readFileSync(key_path+'/private.key')
const PUBLIC_KEY = fs.readFileSync(key_path+'/public.key')

export default class JwtService {
  static sign(payload: any, options: jwt.SignOptions = {}) {
    return jwt.sign(payload, PRIVATE_KEY, {
      algorithm: 'RS256',
      expiresIn: '1h',
      ...options,
    })
  }

  static verify<T = ServerJwtPayload>(token: string): T {
    return jwt.verify(token, PUBLIC_KEY, {
      algorithms: ['RS256'],
    }) as T
  }

  static decode(token: string) {
    return jwt.decode(token)
  }
}