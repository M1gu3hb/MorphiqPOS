import { type NextRequest, NextResponse } from 'next/server';

import { construirCsp } from '@/seguridad/csp';

/**
 * Middleware de la aplicacion.
 *
 * Hace dos cosas, y las dos importan:
 *
 * 1. **Content-Security-Policy con nonce por peticion.** Sin `unsafe-inline`.
 *    Es lo que hace que un nombre de negocio o de mesa con HTML dentro no pueda
 *    ejecutarse aunque alguien se equivoque al renderizarlo (SEC-XSS).
 *
 * 2. **El esqueleto de la sesion de servidor.** Hoy solo propaga el
 *    identificador de correlacion; la verificacion de sesion y de ambito llega
 *    en F1.1 con el PIN en servidor (P0-01). Se deja el punto de enganche
 *    escrito para que no se resuelva improvisando dentro de una pagina.
 */

/** Cabecera con la que las capas de abajo leen el nonce de esta peticion. */
export const CABECERA_NONCE = 'x-morphiqpos-nonce';

/** Identificador que hila una peticion con sus escrituras en `auditoria`. */
export const CABECERA_CORRELACION = 'x-morphiqpos-correlacion';

export function middleware(peticion: NextRequest): NextResponse {
  const nonce = crypto.randomUUID().replaceAll('-', '');
  const correlacion = crypto.randomUUID();
  const esDesarrollo = process.env.NODE_ENV === 'development';

  const cabeceras = new Headers(peticion.headers);
  cabeceras.set(CABECERA_NONCE, nonce);
  cabeceras.set(CABECERA_CORRELACION, correlacion);

  const respuesta = NextResponse.next({ request: { headers: cabeceras } });

  respuesta.headers.set('Content-Security-Policy', construirCsp(nonce, esDesarrollo));
  respuesta.headers.set(CABECERA_CORRELACION, correlacion);

  // --- Punto de enganche de la sesion (F1.1) -------------------------------
  // Aqui iran: leer la cookie HttpOnly de sesion, resolver el ambito
  // (organizacion, sucursal, terminal, empleo) y redirigir al login si falta.
  // NO se resuelve dentro de una pagina: el ambito viene de la sesion del
  // servidor, jamas de un parametro del cliente (R16).

  return respuesta;
}

export const config = {
  // Se excluyen los archivos estaticos: no necesitan CSP ni sesion, y pasarlos
  // por el middleware cuesta latencia en cada icono.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif)$).*)'],
};
