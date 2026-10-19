import { validarEntorno } from '@morphiqpos/contracts';
import { cookieDeCierre, leerCookie, NOMBRE_COOKIE } from '@morphiqpos/app/http';
import { cerrarSesion, resolverSesion } from '@morphiqpos/app/sesion';
import { negociosDelDespliegue } from '@morphiqpos/app/negocio';

import { peticionDeEscrituraValida } from '~/servidor/seguridad-http';
import { cookieDePresentacion, COOKIE_PRESENTACION } from '~/servidor/cookie-presentacion';
import { cookieDeEntrada } from '~/servidor/entrada';

/**
 * Cierre de sesion.
 *
 * Caduca la cookie de verdad (`Max-Age=0`). No toca la del dispositivo: la
 * terminal sigue enrolada, es el cajero quien se va.
 */

export const runtime = 'nodejs';

export async function POST(peticion: Request): Promise<Response> {
  const entorno = validarEntorno(process.env);
  if (!peticionDeEscrituraValida(peticion, entorno.APP_URL, entorno.APP_URL_ALTERNAS)) {
    return Response.json(
      {
        ok: false,
        error: { codigo: 'SIN_PERMISO', mensaje: 'Petición de escritura rechazada.' },
      },
      { status: 403, headers: { 'cache-control': 'no-store' } },
    );
  }

  const tokenDueno = leerCookie(peticion.headers.get('cookie'), COOKIE_PRESENTACION);
  const dueno =
    tokenDueno === undefined
      ? null
      : await resolverSesion({ token: tokenDueno, secreto: entorno.SESSION_SECRET });
  const entrada = dueno?.ok
    ? (await negociosDelDespliegue(entorno.ORGANIZACION, peticion.headers.get('host'))).find(
        (n) => n.organizacionId === dueno.sesion.organizacionId,
      )
    : undefined;
  await cerrarSesion(
    leerCookie(peticion.headers.get('cookie'), NOMBRE_COOKIE),
    entorno.SESSION_SECRET,
  );
  await cerrarSesion(
    leerCookie(peticion.headers.get('cookie'), COOKIE_PRESENTACION),
    entorno.SESSION_SECRET,
  );
  const respuesta = new Response(JSON.stringify({ ok: true, datos: null }), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'set-cookie': cookieDeCierre(entorno.NODE_ENV === 'production'),
    },
  });
  respuesta.headers.append(
    'set-cookie',
    cookieDePresentacion('', entorno.NODE_ENV === 'production', 0),
  );
  if (entrada !== undefined)
    respuesta.headers.append(
      'set-cookie',
      cookieDeEntrada(entrada.slug, entorno.NODE_ENV === 'production'),
    );
  return respuesta;
}
