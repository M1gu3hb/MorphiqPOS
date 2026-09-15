import { validarEntorno } from '@morphiqpos/contracts';
import { cookieDeCierre, leerCookie, NOMBRE_COOKIE } from '@morphiqpos/app/http';
import { cerrarSesion } from '@morphiqpos/app/sesion';

import { peticionDeEscrituraValida } from '~/servidor/seguridad-http';

/**
 * Cierre de sesion.
 *
 * Caduca la cookie de verdad (`Max-Age=0`). No toca la del dispositivo: la
 * terminal sigue enrolada, es el cajero quien se va.
 */

export const runtime = 'nodejs';

export async function POST(peticion: Request): Promise<Response> {
  const entorno = validarEntorno(process.env);
  if (!peticionDeEscrituraValida(peticion, entorno.APP_URL)) {
    return Response.json(
      {
        ok: false,
        error: { codigo: 'SIN_PERMISO', mensaje: 'Petición de escritura rechazada.' },
      },
      { status: 403, headers: { 'cache-control': 'no-store' } },
    );
  }

  await cerrarSesion(
    leerCookie(peticion.headers.get('cookie'), NOMBRE_COOKIE),
    entorno.SESSION_SECRET,
  );
  return new Response(JSON.stringify({ ok: true, datos: null }), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'set-cookie': cookieDeCierre(entorno.NODE_ENV === 'production'),
    },
  });
}
