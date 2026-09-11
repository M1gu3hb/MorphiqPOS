import { validarEntorno } from '@morphiqpos/contracts';
import { cookieDeCierre } from '@morphiqpos/app/http';

/**
 * Cierre de sesion.
 *
 * Caduca la cookie de verdad (`Max-Age=0`). No toca la del dispositivo: la
 * terminal sigue enrolada, es el cajero quien se va.
 */

export const runtime = 'nodejs';

export function POST(): Response {
  const entorno = validarEntorno(process.env);
  return new Response(JSON.stringify({ ok: true, datos: null }), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'set-cookie': cookieDeCierre(entorno.NODE_ENV === 'production'),
    },
  });
}
