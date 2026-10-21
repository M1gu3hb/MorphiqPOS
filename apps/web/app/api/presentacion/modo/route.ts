import { esErrorDominio, validarEntorno } from '@morphiqpos/contracts';
import {
  cookieDeSesion,
  cuerpoDentroDelLimite,
  leerCookie,
  NOMBRE_COOKIE,
} from '@morphiqpos/app/http';
import {
  abrirSesionEnElEspejo,
  asegurarEspejo,
  cambiarModoDePresentacion,
  estadoDePresentacion,
  gemeloEnPresentacion,
  restauranteDelContexto,
} from '@morphiqpos/app/presentacion';
import { destinosDePresentacion, resolverSesion, verificarSesion } from '@morphiqpos/app/sesion';
import { z } from 'zod';

import { COOKIE_PRESENTACION } from '~/servidor/cookie-presentacion';
import { cookieDeDispositivo, NOMBRE_COOKIE_DISPOSITIVO } from '~/servidor/dispositivo';
import { peticionDeEscrituraValida } from '~/servidor/seguridad-http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// Preparar la presentación siembra un restaurante entero la primera vez.
export const maxDuration = 300;

/**
 * EL MODO PRESENTACIÓN AL CLIENTE del restaurante (Configuración → Presentación, 21-10).
 *
 * Lo enciende y lo apaga SÓLO el dueño general con la presentación desbloqueada por su PIN
 * (la cookie `COOKIE_PRESENTACION`, la misma de «Modelos de negocio»). Ocultar el switch a
 * los demás no autoriza nada: esto se comprueba aquí en cada petición.
 *
 *   GET  → si el contexto es un restaurante, su estado (encendido, preparado, días).
 *   POST `preparar`  → crea o completa el contexto de presentación (idempotente).
 *   POST `encender`  → lo enciende y abre la sesión del dueño en él.
 *   POST `apagar`    → lo apaga y devuelve al dueño a su sesión del restaurante real.
 */

const Entrada = z.object({ accion: z.enum(['preparar', 'encender', 'apagar']) });

function json(datos: unknown, status = 200) {
  return Response.json(datos, { status, headers: { 'cache-control': 'no-store' } });
}

function negado(mensaje: string, status = 403) {
  return json({ ok: false, error: { mensaje } }, status);
}

/** El restaurante de la sesión en curso y, si lo hay, el dueño general desbloqueado. */
async function contexto(peticion: Request) {
  const entorno = validarEntorno(process.env);
  const cookie = peticion.headers.get('cookie');
  const actual = await resolverSesion({
    token: leerCookie(cookie, NOMBRE_COOKIE),
    secreto: entorno.SESSION_SECRET,
  });
  if (!actual.ok) return { entorno, cookie, restaurante: null, general: null } as const;
  const restaurante = await restauranteDelContexto(actual.sesion.organizacionId);
  const maestro = leerCookie(cookie, COOKIE_PRESENTACION);
  const raiz = await resolverSesion({ token: maestro, secreto: entorno.SESSION_SECRET });
  const destinos =
    raiz.ok && raiz.sesion.presentador === undefined
      ? await destinosDePresentacion(raiz.sesion)
      : [];
  // El dueño general con ese restaurante entre sus destinos (o como su propio negocio).
  const empleoEnElRestaurante =
    !raiz.ok || restaurante === null
      ? null
      : raiz.sesion.organizacionId === restaurante
        ? raiz.sesion.empleoId
        : (destinos.find((d) => d.organizacionId === restaurante)?.empleoId ?? null);
  const general =
    raiz.ok && destinos.length > 0 && empleoEnElRestaurante !== null && maestro !== undefined
      ? { sesion: raiz.sesion, token: maestro, empleoEnElRestaurante }
      : null;
  return { entorno, cookie, restaurante, general } as const;
}

export async function GET(peticion: Request) {
  const { restaurante, general } = await contexto(peticion);
  if (restaurante === null) return json({ ok: true, datos: { disponible: false } });
  const estado = await estadoDePresentacion(restaurante);
  return json({
    ok: true,
    datos: {
      disponible: true,
      desbloqueado: general !== null,
      activo: estado.modo.activo,
      preparado: estado.preparado,
      dias: estado.historial.length,
    },
  });
}

export async function POST(peticion: Request) {
  const { entorno, cookie, restaurante, general } = await contexto(peticion);
  if (!peticionDeEscrituraValida(peticion, entorno.APP_URL, entorno.APP_URL_ALTERNAS))
    return negado('Petición rechazada.');
  if (!cuerpoDentroDelLimite(peticion.headers)) return json({ ok: false }, 413);
  const entrada = Entrada.safeParse(await peticion.json().catch(() => null));
  if (!entrada.success) return negado('Revisa los datos.', 400);
  if (restaurante === null) return negado('El modo presentación es del restaurante.', 400);
  if (general === null) return negado('Desbloquea la presentación con el PIN del dueño general.');

  const seguro = entorno.NODE_ENV === 'production';
  try {
    if (entrada.data.accion === 'preparar') {
      const espejo = await asegurarEspejo(restaurante, general.empleoEnElRestaurante);
      const estado = await estadoDePresentacion(restaurante);
      return json({
        ok: true,
        datos: {
          preparado: estado.preparado,
          creado: espejo.creado,
          dias: estado.historial.length,
        },
      });
    }

    if (entrada.data.accion === 'encender') {
      await cambiarModoDePresentacion(restaurante, true);
      const gemelo = await gemeloEnPresentacion(restaurante, general.empleoEnElRestaurante);
      const raiz = verificarSesion(general.token, entorno.SESSION_SECRET);
      if (gemelo === null || !raiz.ok) return json({ ok: true, datos: { destino: '/login-pos' } });
      const sesion = await abrirSesionEnElEspejo({
        origenId: restaurante,
        gemelo,
        deviceToken: leerCookie(cookie, NOMBRE_COOKIE_DISPOSITIVO) ?? '',
        pimienta: entorno.PIN_PEPPER,
        secreto: entorno.SESSION_SECRET,
        presentador: raiz.carga,
      });
      const respuesta = json({ ok: true, datos: { destino: '/' } });
      respuesta.headers.append(
        'set-cookie',
        cookieDeSesion({ token: sesion.token, maxEdadSegundos: sesion.maxEdadSegundos, seguro }),
      );
      if (sesion.deviceToken !== null)
        respuesta.headers.append(
          'set-cookie',
          cookieDeDispositivo({
            token: sesion.deviceToken,
            maxEdadSegundos: 365 * 24 * 60 * 60,
            seguro,
          }),
        );
      return respuesta;
    }

    await cambiarModoDePresentacion(restaurante, false);
    // De vuelta al restaurante real: si es el negocio del dueño general, su sesión raíz; si no,
    // que elija en «Modelos de negocio».
    if (general.sesion.organizacionId !== restaurante)
      return json({ ok: true, datos: { destino: '/configuracion?tab=presentacion' } });
    const respuesta = json({ ok: true, datos: { destino: '/' } });
    respuesta.headers.append(
      'set-cookie',
      cookieDeSesion({ token: general.token, maxEdadSegundos: 8 * 60 * 60, seguro }),
    );
    return respuesta;
  } catch (fallo) {
    const mensaje = esErrorDominio(fallo)
      ? fallo.message
      : 'No se pudo cambiar el modo presentación. Tus datos siguen como estaban.';
    return negado(mensaje, 409);
  }
}
