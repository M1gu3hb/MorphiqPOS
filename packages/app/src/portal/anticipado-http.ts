import 'server-only';

import { ErrorDominio, validarEntorno } from '@morphiqpos/contracts';
import { conTransaccion, obtenerDb } from '@morphiqpos/data';

import { cuerpoDentroDelLimite } from '../http/limite-cuerpo.ts';
import { origenDe } from '../http/limite.ts';
import { negocioDeLaEntrada } from '../negocio/despliegue.ts';
import { correlationIdDe } from '../observabilidad.ts';
import {
  apartarAnticipado,
  entradaApartarAnticipado,
  menuAnticipable,
  type NegocioPublico,
} from './anticipado.ts';
import {
  errorHttp,
  peticionPropia,
  respuesta,
  respuestaDeError,
  type PeticionDelPortal,
  type RespuestaDelPortal,
} from './http.ts';
import { violaIndice } from './errores-sql.ts';
import { permitirPortal } from './limite.ts';

/**
 * C.14 · Las dos rutas públicas del pedido anticipado de la cafetería.
 *
 *   GET  /api/publico/negocio/<slug>/menu
 *   POST /api/publico/negocio/<slug>/apartar
 *
 * ── De qué negocio, sin sesión ───────────────────────────────────────────
 * El slug de la dirección, DENTRO de los negocios de este despliegue
 * (`negocioDeLaEntrada`, la misma del bloque A). Un slug de otro despliegue, uno que
 * no existe y uno que no es cafetería contestan lo MISMO —404, «ese menú no
 * existe»—: distinguirlos dejaría enumerar los negocios del servidor.
 *
 * ── Lo demás, como el resto del portal ───────────────────────────────────
 * La misma frontera de escritura (JSON, cabecera propia, origen permitido), el mismo
 * tope de cuerpo, el límite contado ANTES de tocar la base y los errores del dominio
 * con su mensaje para quien está en la fila.
 */

/** La clave de idempotencia: la del navegador, con forma y largo acotados. */
const CLAVE = /^[A-Za-z0-9-]{8,100}$/;
/** La forma de un slug: la misma que exige el alta. Lo demás ni se busca ni se cuenta. */
const SLUG = /^[a-z0-9-]{3,60}$/;

async function negocioDeLaCafeteria(
  slug: string,
  host: string | null,
): Promise<NegocioPublico & { readonly nombre: string }> {
  const entorno = validarEntorno(process.env);
  const noExiste = new ErrorDominio('QR_TOKEN_INVALIDO', 'Ese menú no existe.');
  const negocio = await negocioDeLaEntrada(entorno.ORGANIZACION, host, slug);
  if (negocio === null) throw noExiste;
  const db = obtenerDb();
  const org = await db
    .selectFrom('organizaciones')
    .select(['giro'])
    .where('id', '=', negocio.organizacionId)
    .executeTakeFirst();
  if (org?.giro !== 'cafeteria') throw noExiste;
  const sucursal = await db
    .selectFrom('sucursales')
    .select(['id'])
    .where('organizacion_id', '=', negocio.organizacionId)
    .where('activa', '=', true)
    .orderBy('created_at')
    .executeTakeFirst();
  if (sucursal === undefined) throw noExiste;
  return {
    organizacionId: negocio.organizacionId,
    sucursalId: sucursal.id,
    nombre: negocio.nombre,
  };
}

/**
 * La IP de quien pide, para el límite: la MISMA regla que el resto del sistema
 * (`origenDe`, `http/limite.ts`) —la de Vercel, o la ÚLTIMA del reenvío, que es la que
 * añadió el proxy más cercano—. Aquí se tomaba la PRIMERA, que la escribe el cliente:
 * con ella falsificada cada petición caía en un cubo nuevo (auditoría de la 2.4).
 */
function ipDe(peticion: PeticionDelPortal): string {
  return origenDe(peticion.headers) ?? 'sin-ip';
}

async function exigirPermiso(
  accion: 'consulta' | 'apartar_anticipado' | 'apartados_del_negocio',
  llave: string,
  correlationId: string,
): Promise<void> {
  const { PIN_PEPPER } = validarEntorno(process.env);
  const permiso = await permitirPortal(accion, llave, PIN_PEPPER, { correlationId });
  if (!permiso.ok) {
    throw new ErrorDominio(
      'QR_DEMASIADAS_PETICIONES',
      'Demasiados intentos seguidos. Espera un momento o pide en la barra.',
      { esperaSegundos: permiso.esperaSegundos },
    );
  }
}

/** `GET /api/publico/negocio/:slug/menu`. */
export async function servirMenuAnticipado(
  slug: string,
  peticion: PeticionDelPortal,
): Promise<RespuestaDelPortal> {
  const correlationId = correlationIdDe(peticion.headers.get('x-correlation-id'));
  try {
    if (!SLUG.test(slug)) throw new ErrorDominio('QR_TOKEN_INVALIDO', 'Ese menú no existe.');
    await exigirPermiso('consulta', `anticipado:${ipDe(peticion)}`, correlationId);
    const negocio = await negocioDeLaCafeteria(slug, peticion.headers.get('host'));
    const productos = await conTransaccion((tx) => menuAnticipable(tx, negocio.organizacionId));
    return respuesta(200, { ok: true, datos: { negocio: negocio.nombre, productos } });
  } catch (error) {
    return respuestaDeError(error, 'publico.anticipado.menu', { correlationId });
  }
}

/** `POST /api/publico/negocio/:slug/apartar`. */
export async function atenderApartado(
  slug: string,
  peticion: PeticionDelPortal,
): Promise<RespuestaDelPortal> {
  if (peticion.method !== 'POST') return errorHttp(405, 'METODO', 'Usa POST.');
  if (!peticionPropia(peticion)) {
    return errorHttp(403, 'SIN_PERMISO', 'Petición de escritura rechazada.');
  }
  if (!cuerpoDentroDelLimite(peticion.headers)) {
    return errorHttp(413, 'CUERPO_DEMASIADO_GRANDE', 'El cuerpo supera 256 KiB.');
  }
  let crudo: unknown;
  try {
    crudo = await peticion.json();
  } catch {
    return errorHttp(400, 'ENTRADA_INVALIDA', 'El cuerpo de la petición no es JSON.');
  }
  const correlationId = correlationIdDe(peticion.headers.get('x-correlation-id'));
  // SIN CLAVE NO SE APARTA (auditoría de la 2.4): sin ella un reintento del teléfono
  // —la red de la fila es mala— apartaba otro pedido igual. La pantalla siempre la manda.
  const clave = peticion.headers.get('idempotency-key') ?? '';
  if (!CLAVE.test(clave)) {
    return errorHttp(400, 'ENTRADA_INVALIDA', 'Falta la clave del pedido. Vuelve a intentarlo.');
  }

  try {
    // El límite POR IP, antes de todo lo demás: un intento con datos inválidos gasta
    // cuota igual, o barrer la ruta saldría gratis. Por IP y no por «slug + IP»: con el
    // slug en la llave, rotar slugs inventados abría un cubo nuevo —y dos escrituras en
    // `limite_tasa`— por petición (auditoría de la 2.4).
    await exigirPermiso('apartar_anticipado', `anticipado:${ipDe(peticion)}`, correlationId);
    if (!SLUG.test(slug)) throw new ErrorDominio('QR_TOKEN_INVALIDO', 'Ese menú no existe.');

    const entrada = entradaApartarAnticipado.safeParse(crudo);
    if (!entrada.success) {
      return errorHttp(400, 'ENTRADA_INVALIDA', 'Revisa tu nombre, la hora y lo que pides.');
    }
    // El cupo del NEGOCIO, sólo para un negocio que se sirve: un slug que no existe ya
    // contestó 404 arriba sin escribir su cubo.
    const negocio = await negocioDeLaCafeteria(slug, peticion.headers.get('host'));
    await exigirPermiso('apartados_del_negocio', negocio.organizacionId, correlationId);
    const datos = await apartarOElQueYaHay(negocio, entrada.data, clave);
    return respuesta(200, { ok: true, datos }, correlationId);
  } catch (error) {
    return respuestaDeError(error, 'publico.anticipado.apartar', { correlationId });
  }
}

/**
 * DOS PETICIONES CON LA MISMA CLAVE A LA VEZ (auditoría de la 2.4): las dos miran «¿ya
 * hay uno con esta clave?», las dos dicen que no, y la segunda choca con
 * `ordenes_idempotencia` —un 500 para quien sí apartó—. Ese choque es exactamente la
 * respuesta: el apartado ya existe. Se lee en una transacción NUEVA (la que chocó quedó
 * abortada) y se devuelve el mismo, como si la segunda hubiera llegado después.
 */
export async function apartarOElQueYaHay(
  negocio: Parameters<typeof apartarAnticipado>[1],
  entrada: Parameters<typeof apartarAnticipado>[2],
  clave: string,
): ReturnType<typeof apartarAnticipado> {
  try {
    return await conTransaccion((tx) => apartarAnticipado(tx, negocio, entrada, new Date(), clave));
  } catch (error) {
    if (!violaIndice(error, 'ordenes_idempotencia')) throw error;
    return conTransaccion((tx) => apartarAnticipado(tx, negocio, entrada, new Date(), clave));
  }
}
