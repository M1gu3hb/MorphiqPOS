import 'server-only';

import { leerCookie } from '@morphiqpos/app/http';
import { organizacionDelDispositivo } from '@morphiqpos/app/identidad';
import {
  COOKIE_ENTRADA,
  elegirNegocioDeLaEntrada,
  negociosDelDespliegue,
  slugValido,
  type NegocioDelDespliegue,
} from '@morphiqpos/app/negocio';

import { NOMBRE_COOKIE_DISPOSITIVO } from './dispositivo';

/**
 * DE QUÉ NEGOCIO ES ESTA ENTRADA (bloque A de la 2.4). Una sola resolución para la
 * lista de empleados, para `/login-pos` y para `/n/<slug>/login-pos`, para que las
 * tres no puedan discrepar.
 *
 * En este orden, y el orden es la regla:
 *
 * 1 · LA DIRECCIÓN que se pidió (`/n/<slug>/…` o `?negocio=<slug>`). Si se pidió una,
 *     manda ella y NADA más: o este despliegue sirve ese negocio, o `null` —y quien
 *     llama contesta 404, igual para «no existe» que para «no se sirve aquí»—. Pedir
 *     otro negocio nunca cae a los pasos de abajo.
 * 2 · EL DESPLIEGUE, cuando sólo sirve a uno: por el host (`<slug>.<dominio>`, que gana
 *     sobre `ORGANIZACION`) o porque su lista trae uno.
 * 3 · LA ENTRADA RECORDADA: la cookie que pone la lista de empleados al contestar por
 *     una dirección. Es una pista, no una autorización: vuelve a pasar por el paso 1.
 * 4 · LA TERMINAL de este navegador: la cookie del dispositivo la da el servidor tras
 *     un PIN correcto, así que un navegador que la trae es la caja de ese negocio.
 *
 * Sin ninguna: `null`. Un despliegue de varios negocios, sin dirección, no enseña a
 * nadie.
 */
export interface PeticionDeEntrada {
  readonly host: string | null;
  readonly cookies: string | null;
  readonly pedido: string | null | undefined;
  readonly organizacionConfigurada: string | undefined;
  readonly pimienta: string;
}

/** Por dónde se supo el negocio. `/login-pos` redirige cuando no fue el despliegue. */
export type OrigenDeLaEntrada = 'direccion' | 'despliegue' | 'recordada' | 'terminal';

export interface EntradaResuelta {
  readonly negocio: NegocioDelDespliegue;
  readonly origen: OrigenDeLaEntrada;
}

export async function entradaDeEstaPeticion(
  peticion: PeticionDeEntrada,
): Promise<EntradaResuelta | null> {
  const servidos = await negociosDelDespliegue(peticion.organizacionConfigurada, peticion.host);
  const con = (negocio: NegocioDelDespliegue | null | undefined, origen: OrigenDeLaEntrada) =>
    negocio === null || negocio === undefined ? null : { negocio, origen };

  const pedido = (peticion.pedido ?? '').trim();
  if (pedido !== '') return con(elegirNegocioDeLaEntrada(servidos, pedido), 'direccion');

  const delDespliegue = con(elegirNegocioDeLaEntrada(servidos, null), 'despliegue');
  if (delDespliegue !== null) return delDespliegue;

  const recordado = slugValido(leerCookie(peticion.cookies, COOKIE_ENTRADA));
  const deLaCookie = con(
    recordado === null ? null : elegirNegocioDeLaEntrada(servidos, recordado),
    'recordada',
  );
  if (deLaCookie !== null) return deLaCookie;

  const token = leerCookie(peticion.cookies, NOMBRE_COOKIE_DISPOSITIVO) ?? '';
  const organizacionId = await organizacionDelDispositivo(
    token,
    peticion.pimienta,
    servidos.map((n) => n.organizacionId),
  );
  return con(
    servidos.find((n) => n.organizacionId === organizacionId),
    'terminal',
  );
}

/** Sólo el negocio. */
export async function negocioDeEstaEntrada(
  peticion: PeticionDeEntrada,
): Promise<NegocioDelDespliegue | null> {
  return (await entradaDeEstaPeticion(peticion))?.negocio ?? null;
}

/** La cookie que recuerda la entrada. Un año, como la del dispositivo. */
export function cookieDeEntrada(slug: string, seguro: boolean): string {
  const partes = [
    `${COOKIE_ENTRADA}=${encodeURIComponent(slug)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${String(60 * 60 * 24 * 365)}`,
  ];
  if (seguro) partes.push('Secure');
  return partes.join('; ');
}
