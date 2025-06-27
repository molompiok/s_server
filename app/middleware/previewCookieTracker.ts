// app/Middleware/CookieTracker.ts
import { HttpContext } from '@adonisjs/core/http'


export default class CookieTracker {
  public async handle({ request, response }: HttpContext, next: () => Promise<void>) {
    const heur = request.cookie('heur')
    const counter = request.cookie('counter')

    
    console.log('🔍 🔎🔍 🔎',{
        heur,
        counter,
        url:request.completeUrl(),
        method:request.method()
    });
    
    // Traitement normal de la requête
    await next()

    // Mise à jour des cookies
    response.cookie('heur', Date.now().toString(), {
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30 // 30 jours
    })
    const c= parseInt(counter)
    const n = (isNaN(c)?0: c) + 1;
    response.cookie('counter', (n).toString(), {
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30
    })
  }
}
