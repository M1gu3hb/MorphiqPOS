import 'server-only';

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import { conTransaccion, obtenerDb, repoIdentidad } from '@morphiqpos/data';

import { esperaTrasFallo, FORMA_PIN, INTENTOS_ANTES_DE_BLOQUEAR, verificarPin } from './pin.ts';

/**
 * EL PIN DEL SUPERVISOR EN LA TERMINAL DE LA CAJERA (F-205, D-28 de la 2.4).
 *
 * Cada `02-DINERO-Y-CAJA §3` lo pide igual: un descuento por encima del tope del puesto
 * lo autoriza alguien con más tope, tecleando SU PIN en la terminal donde se está
 * cobrando, «y el PIN queda en la bitácora». Hasta la 2.4 la única salida era la del
 * salón —«que entre con su PIN y cobre desde su sesión»—, que en un mostrador obliga a
 * cerrar la sesión de la cajera con la venta armada y la fila esperando.
 *
 * ── Cómo funciona ────────────────────────────────────────────────────────────
 * La cajera, con SU sesión, manda el empleo del supervisor y el PIN que él tecleó. El
 * servidor lo comprueba exactamente como al entrar —Argon2id con pimienta, el mismo
 * bloqueo progresivo por intentos, en el mismo renglón de `credenciales_pin`— y, si es
 * bueno y el puesto autoriza, firma una AUTORIZACIÓN: corta (dos minutos), atada al
 * negocio y a la cajera que la pidió. El descuento la presenta al aplicarse y ahí se
 * escribe la fila de `autorizaciones_descuento` con quién autorizó: ésa es la bitácora.
 *
 * ── Por qué no es un comando ─────────────────────────────────────────────────
 * Por el intento fallido. Un comando que rechaza revierte su transacción, y con ella el
 * contador de intentos: el PIN del gerente se podría probar mil veces desde la caja sin
 * que el bloqueo se enterara. Aquí cada intento fallido se confirma en su propia
 * transacción ANTES de contestar, igual que en `entrarConPin`.
 *
 * La firma usa el secreto de sesión con un prefijo propio (`autorizacion:`): una cookie
 * de sesión no se puede presentar como autorización ni al revés.
 */

/** Quién puede autorizar: los puestos con tope propio por encima del de la caja. */
export const ROLES_QUE_AUTORIZAN: readonly string[] = ['gerente', 'administrador', 'dueno'];

/** Dos minutos: lo que tarda en cobrarse la venta que se está autorizando. */
export const VIGENCIA_AUTORIZACION_SEGUNDOS = 120;

export interface PeticionDeSupervisor {
  readonly organizacionId: string;
  /** Quien pide: la persona de la sesión. */
  readonly solicitaEmpleoId: string;
  /** Quien autoriza: el que teclea su PIN. */
  readonly empleoId: string;
  readonly pin: string;
  readonly pimienta: string;
  readonly secreto: string;
}

export type ResultadoDeSupervisor =
  | {
      readonly ok: true;
      readonly autorizacion: string;
      readonly rol: string;
      readonly vence: string;
    }
  | {
      readonly ok: false;
      readonly motivo: 'credenciales' | 'bloqueada' | 'no_autoriza' | 'uno_mismo';
      readonly esperaSegundos?: number;
    };

/** Lo que viaja dentro de la autorización. Sin datos personales. */
export interface CargaDeAutorizacion {
  readonly org: string;
  readonly supervisor: string;
  readonly rol: string;
  readonly solicita: string;
  /** Epoch en segundos. */
  readonly exp: number;
  readonly n: string;
}

const PREFIJO = 'autorizacion:';

function firma(cuerpo: string, secreto: string): string {
  return createHmac('sha256', secreto).update(`${PREFIJO}${cuerpo}`).digest('base64url');
}

export function firmarAutorizacion(carga: CargaDeAutorizacion, secreto: string): string {
  const cuerpo = Buffer.from(JSON.stringify(carga), 'utf8').toString('base64url');
  return `${cuerpo}.${firma(cuerpo, secreto)}`;
}

function igualEnTiempoConstante(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function esCarga(valor: unknown): valor is CargaDeAutorizacion {
  if (typeof valor !== 'object' || valor === null) return false;
  const v = valor as Record<string, unknown>;
  return (
    typeof v['org'] === 'string' &&
    typeof v['supervisor'] === 'string' &&
    typeof v['rol'] === 'string' &&
    typeof v['solicita'] === 'string' &&
    typeof v['exp'] === 'number' &&
    typeof v['n'] === 'string'
  );
}

/**
 * La autorización, si es auténtica, vigente, de ESTE negocio y para ESTA persona. Si
 * no, `null`: quien la presenta decide el error.
 */
export function leerAutorizacion(
  token: string,
  esperado: { readonly organizacionId: string; readonly solicitaEmpleoId: string },
  secreto: string,
  ahora: Date = new Date(),
): CargaDeAutorizacion | null {
  const punto = token.lastIndexOf('.');
  if (punto <= 0) return null;
  const cuerpo = token.slice(0, punto);
  if (!igualEnTiempoConstante(token.slice(punto + 1), firma(cuerpo, secreto))) return null;
  let carga: unknown;
  try {
    carga = JSON.parse(Buffer.from(cuerpo, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!esCarga(carga)) return null;
  if (carga.exp * 1000 <= ahora.getTime()) return null;
  if (carga.org !== esperado.organizacionId) return null;
  if (carga.solicita !== esperado.solicitaEmpleoId) return null;
  if (!ROLES_QUE_AUTORIZAN.includes(carga.rol)) return null;
  return carga;
}

/** El puesto vigente de un empleo activo del negocio, o `null`. */
async function rolDe(organizacionId: string, empleoId: string): Promise<string | null> {
  const fila = await obtenerDb()
    .selectFrom('empleos')
    .select('rol')
    .where('organizacion_id', '=', organizacionId)
    .where('id', '=', empleoId)
    .where('activo', '=', true)
    .executeTakeFirst();
  return fila?.rol ?? null;
}

/**
 * Comprueba el PIN del supervisor y, si es bueno, firma la autorización.
 *
 * El orden importa igual que al entrar: la forma del PIN, la credencial dentro del
 * negocio, el bloqueo ANTES de comparar, y el intento fallido confirmado antes de
 * contestar. El puesto se mira primero: un PIN bueno de alguien que no autoriza no
 * cuenta como intento, porque no se comparó.
 */
export async function autorizarConPin(
  peticion: PeticionDeSupervisor,
  ahora: Date = new Date(),
): Promise<ResultadoDeSupervisor> {
  if (peticion.empleoId === peticion.solicitaEmpleoId) return { ok: false, motivo: 'uno_mismo' };
  if (!FORMA_PIN.test(peticion.pin)) return { ok: false, motivo: 'credenciales' };

  const rol = await rolDe(peticion.organizacionId, peticion.empleoId);
  if (rol === null) return { ok: false, motivo: 'credenciales' };
  if (!ROLES_QUE_AUTORIZAN.includes(rol)) return { ok: false, motivo: 'no_autoriza' };

  const credencial = await repoIdentidad.credencialParaVerificar(
    obtenerDb(),
    peticion.organizacionId,
    peticion.empleoId,
  );
  if (credencial === null) return { ok: false, motivo: 'credenciales' };

  if (credencial.bloqueadaHasta !== null && credencial.bloqueadaHasta.getTime() > ahora.getTime()) {
    const restan = Math.ceil((credencial.bloqueadaHasta.getTime() - ahora.getTime()) / 1000);
    return { ok: false, motivo: 'bloqueada', esperaSegundos: restan };
  }

  const correcto = await verificarPin(peticion.pin, credencial.pinHash, peticion.pimienta);
  if (!correcto) {
    const intentos = credencial.intentosFallidos + 1;
    const espera = esperaTrasFallo(intentos);
    const bloqueadaHasta = espera === 0 ? null : new Date(ahora.getTime() + espera * 1000);
    await conTransaccion((tx) =>
      repoIdentidad.registrarIntentoFallido(tx, credencial.credencialId, bloqueadaHasta),
    );
    return intentos >= INTENTOS_ANTES_DE_BLOQUEAR
      ? { ok: false, motivo: 'bloqueada', esperaSegundos: espera }
      : { ok: false, motivo: 'credenciales' };
  }

  await conTransaccion((tx) => repoIdentidad.limpiarIntentos(tx, credencial.credencialId));
  const exp = Math.floor(ahora.getTime() / 1000) + VIGENCIA_AUTORIZACION_SEGUNDOS;
  return {
    ok: true,
    rol,
    vence: new Date(exp * 1000).toISOString(),
    autorizacion: firmarAutorizacion(
      {
        org: peticion.organizacionId,
        supervisor: peticion.empleoId,
        rol,
        solicita: peticion.solicitaEmpleoId,
        exp,
        n: randomBytes(8).toString('hex'),
      },
      peticion.secreto,
    ),
  };
}
