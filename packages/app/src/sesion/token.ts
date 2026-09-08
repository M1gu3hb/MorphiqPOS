import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * El token de sesión: firmado, con caducidad, y sin nada que valga la pena robar.
 *
 * Sólo lleva a QUIÉN y DESDE DÓNDE — identidad, empleo y terminal. El ámbito real
 * (organización, sucursal, rol) se resuelve leyendo la base en cada petición.
 *
 * Cuesta una consulta por request y vale la pena: si a un cajero se le retira el
 * empleo a media jornada, la siguiente petición falla. Con el rol metido en el
 * token, seguiría cobrando hasta que expirara.
 *
 * `HttpOnly` + `Secure` + `SameSite=Lax` los pone quien escribe la cookie; aquí
 * sólo se firma el contenido. Nunca se guarda en `localStorage` (morphiq-prs §10).
 */

/** Lo que viaja dentro del token. Cero datos personales (R31). */
export interface CargaSesion {
  /** Identificador de esta sesión, para poder revocarla. */
  readonly sid: string;
  readonly identidadId: string;
  readonly empleoId: string;
  readonly terminalId: string | null;
  /** Epoch en segundos. */
  readonly exp: number;
}

/** Ocho horas: una jornada. Más allá, el cajero vuelve a teclear su PIN. */
export const DURACION_SESION_SEGUNDOS = 8 * 60 * 60;

export function nuevoIdDeSesion(): string {
  return randomBytes(16).toString('hex');
}

export function firmarSesion(carga: CargaSesion, secreto: string): string {
  const cuerpo = base64url(JSON.stringify(carga));
  return `${cuerpo}.${firma(cuerpo, secreto)}`;
}

export type Verificacion =
  | { readonly ok: true; readonly carga: CargaSesion }
  | { readonly ok: false; readonly motivo: 'ausente' | 'malformado' | 'firma' | 'expirado' };

/**
 * Verifica el token. Distingue «expirado» de «firma inválida» a propósito: lo
 * primero es un cajero que se fue a comer, lo segundo es alguien manipulando la
 * cookie. La ruta traduce ambos a 401, pero sólo el segundo merece auditarse.
 */
export function verificarSesion(token: string | undefined, secreto: string): Verificacion {
  if (token === undefined || token === '') return { ok: false, motivo: 'ausente' };

  const punto = token.lastIndexOf('.');
  if (punto <= 0) return { ok: false, motivo: 'malformado' };

  const cuerpo = token.slice(0, punto);
  const recibida = token.slice(punto + 1);
  if (!igualEnTiempoConstante(recibida, firma(cuerpo, secreto))) {
    return { ok: false, motivo: 'firma' };
  }

  const carga = leerCarga(cuerpo);
  if (carga === null) return { ok: false, motivo: 'malformado' };
  if (carga.exp * 1000 <= Date.now()) return { ok: false, motivo: 'expirado' };

  return { ok: true, carga };
}

function firma(cuerpo: string, secreto: string): string {
  return createHmac('sha256', secreto).update(cuerpo).digest('base64url');
}

function base64url(texto: string): string {
  return Buffer.from(texto, 'utf8').toString('base64url');
}

function leerCarga(cuerpo: string): CargaSesion | null {
  let crudo: unknown;
  try {
    crudo = JSON.parse(Buffer.from(cuerpo, 'base64url').toString('utf8'));
  } catch {
    // Un cuerpo que no es JSON es una cookie manipulada o de otra versión.
    return null;
  }
  if (typeof crudo !== 'object' || crudo === null) return null;

  const c = crudo as Record<string, unknown>;
  if (typeof c['sid'] !== 'string') return null;
  if (typeof c['identidadId'] !== 'string') return null;
  if (typeof c['empleoId'] !== 'string') return null;
  if (typeof c['exp'] !== 'number') return null;
  const terminal = c['terminalId'];
  if (terminal !== null && typeof terminal !== 'string') return null;

  return {
    sid: c['sid'],
    identidadId: c['identidadId'],
    empleoId: c['empleoId'],
    terminalId: terminal,
    exp: c['exp'],
  };
}

/**
 * Comparación en tiempo constante.
 *
 * `a === b` sale antes en el primer byte distinto, y esa diferencia de tiempo es
 * medible: permite reconstruir la firma byte a byte. Aquí siempre se recorre
 * todo, y las longitudes distintas se resuelven sin ramificar sobre el contenido.
 */
function igualEnTiempoConstante(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
