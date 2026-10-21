import { validarEntorno } from '@morphiqpos/contracts';
import {
  cookieDeSesion,
  cuerpoDentroDelLimite,
  leerCookie,
  NOMBRE_COOKIE,
  permitir,
} from '@morphiqpos/app/http';
import {
  cambiarNegocioDePresentacion,
  empleoRaizDePresentacion,
  entrarConPin,
  negociosDePresentacion,
} from '@morphiqpos/app/identidad';
import { negociosDelDespliegue } from '@morphiqpos/app/negocio';
import { resolverSesion } from '@morphiqpos/app/sesion';
import { z } from 'zod';

import { cookieDePresentacion, COOKIE_PRESENTACION } from '~/servidor/cookie-presentacion';
import { cookieDeDispositivo, NOMBRE_COOKIE_DISPOSITIVO } from '~/servidor/dispositivo';
import { cookieDeEntrada } from '~/servidor/entrada';
import { peticionDeEscrituraValida } from '~/servidor/seguridad-http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const Entrada = z.union([
  z.object({ accion: z.literal('desbloquear'), pin: z.string().regex(/^\d{4,8}$/) }),
  z.object({ accion: z.literal('cambiar'), empleoId: z.uuid() }),
]);

function json(datos: unknown, status = 200) {
  return Response.json(datos, { status, headers: { 'cache-control': 'no-store' } });
}

export async function GET(peticion: Request) {
  const entorno = validarEntorno(process.env);
  const cookie = peticion.headers.get('cookie');
  const maestro = leerCookie(cookie, COOKIE_PRESENTACION);
  const token = maestro ?? leerCookie(cookie, NOMBRE_COOKIE);
  const negocios = await negociosDelDespliegue(entorno.ORGANIZACION, peticion.headers.get('host'));
  const opciones = await negociosDePresentacion(
    token,
    entorno.SESSION_SECRET,
    negocios.map((n) => n.organizacionId),
  );
  return json({
    ok: true,
    datos: { negocios: opciones, desbloqueado: maestro !== undefined && opciones.length > 0 },
  });
}

export async function POST(peticion: Request) {
  const entorno = validarEntorno(process.env);
  if (!peticionDeEscrituraValida(peticion, entorno.APP_URL, entorno.APP_URL_ALTERNAS))
    return json({ ok: false, error: { mensaje: 'Petición rechazada.' } }, 403);
  if (!cuerpoDentroDelLimite(peticion.headers)) return json({ ok: false }, 413);
  const entrada = Entrada.safeParse(await peticion.json().catch(() => null));
  if (!entrada.success) return json({ ok: false, error: { mensaje: 'Revisa los datos.' } }, 400);
  const cookie = peticion.headers.get('cookie');
  const maestro = leerCookie(cookie, COOKIE_PRESENTACION);
  const token = maestro ?? leerCookie(cookie, NOMBRE_COOKIE);
  const negocios = await negociosDelDespliegue(entorno.ORGANIZACION, peticion.headers.get('host'));
  const servidas = negocios.map((n) => n.organizacionId);
  const opciones = await negociosDePresentacion(token, entorno.SESSION_SECRET, servidas);
  if (opciones.length === 0)
    return json(
      { ok: false, error: { mensaje: 'Tu usuario no tiene acceso a la presentación general.' } },
      403,
    );
  const seguro = entorno.NODE_ENV === 'production';
  if (entrada.data.accion === 'desbloquear') {
    const cuota = await permitir('presentacion', peticion.headers, entorno.PIN_PEPPER);
    if (!cuota.ok)
      return json(
        { ok: false, error: { mensaje: 'Demasiados intentos. Espera unos minutos.' } },
        429,
      );
    const origen = await resolverSesion({ token, secreto: entorno.SESSION_SECRET });
    if (!origen.ok) return json({ ok: false }, 401);
    // Desde una sesión delegada —otro modelo, o el restaurante en presentación— el PIN es el
    // de la cuenta raíz del dueño general, no el de su empleo en el destino (21-10).
    const raiz = await empleoRaizDePresentacion(origen.sesion);
    const acceso = await entrarConPin({
      empleoId: raiz.empleoId,
      organizacionId: raiz.organizacionId,
      pin: entrada.data.pin,
      deviceToken: '',
      pimienta: entorno.PIN_PEPPER,
      secretoSesion: entorno.SESSION_SECRET,
    });
    if (!acceso.ok)
      return json(
        { ok: false, error: { mensaje: 'PIN incorrecto o temporalmente bloqueado.' } },
        401,
      );
    const respuesta = json({ ok: true, datos: { desbloqueado: true } });
    respuesta.headers.append('set-cookie', cookieDePresentacion(acceso.token, seguro));
    return respuesta;
  }
  if (maestro === undefined)
    return json({ ok: false, error: { mensaje: 'Desbloquea la presentación con tu PIN.' } }, 403);
  try {
    const salida = await cambiarNegocioDePresentacion({
      token: maestro,
      secreto: entorno.SESSION_SECRET,
      pimienta: entorno.PIN_PEPPER,
      servidas,
      empleoId: entrada.data.empleoId,
      deviceToken: leerCookie(cookie, NOMBRE_COOKIE_DISPOSITIVO) ?? '',
    });
    const respuesta = json({ ok: true, datos: { destino: '/' } });
    respuesta.headers.append(
      'set-cookie',
      cookieDeSesion({ token: salida.token, maxEdadSegundos: salida.maxEdadSegundos, seguro }),
    );
    respuesta.headers.append('set-cookie', cookieDeEntrada(salida.destino.slug, seguro));
    if (salida.deviceToken !== null)
      respuesta.headers.append(
        'set-cookie',
        cookieDeDispositivo({
          token: salida.deviceToken,
          maxEdadSegundos: 365 * 24 * 60 * 60,
          seguro,
        }),
      );
    return respuesta;
  } catch {
    return json(
      {
        ok: false,
        error: { mensaje: 'No se pudo abrir ese negocio. Tu contexto actual sigue activo.' },
      },
      403,
    );
  }
}
