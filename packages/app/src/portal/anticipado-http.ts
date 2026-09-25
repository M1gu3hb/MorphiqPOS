import 'server-only';

import { ErrorDominio, validarEntorno } from '@morphiqpos/contracts';
import { conTransaccion, obtenerDb } from '@morphiqpos/data';

import { cuerpoDentroDelLimite } from '../http/limite-cuerpo.ts';
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

/** La IP de quien pide, para el límite. Detrás de Vercel es la primera del reenvío. */
function ipDe(peticion: PeticionDelPortal): string {
  const reenviada = peticion.headers.get('x-forwarded-for');
  const primera = reenviada?.split(',')[0]?.trim() ?? '';
  return primera === '' ? (peticion.headers.get('x-real-ip') ?? 'sin-ip') : primera;
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

  try {
    // El límite, ANTES de todo lo demás: un intento con datos inválidos gasta cuota
    // igual, o barrer la ruta saldría gratis.
    await exigirPermiso('apartar_anticipado', `${slug}:${ipDe(peticion)}`, correlationId);
    await exigirPermiso('apartados_del_negocio', slug, correlationId);

    const entrada = entradaApartarAnticipado.safeParse(crudo);
    if (!entrada.success) {
      return errorHttp(400, 'ENTRADA_INVALIDA', 'Revisa tu nombre, la hora y lo que pides.');
    }
    const negocio = await negocioDeLaCafeteria(slug, peticion.headers.get('host'));
    const clave = peticion.headers.get('idempotency-key');
    const datos = await conTransaccion((tx) =>
      apartarAnticipado(
        tx,
        negocio,
        entrada.data,
        new Date(),
        clave !== null && CLAVE.test(clave) ? clave : null,
      ),
    );
    return respuesta(200, { ok: true, datos }, correlationId);
  } catch (error) {
    return respuestaDeError(error, 'publico.anticipado.apartar', { correlationId });
  }
}
