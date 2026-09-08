import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

import { hash, verify } from '@node-rs/argon2';

/**
 * El PIN de un empleado (F1.1-A-03).
 *
 * Corrige P0-01 y SEC-AUTH-001, el peor defecto de las dos fuentes: la pantalla
 * de acceso descargaba la lista de usuarios **con su PIN** y comparaba en el
 * navegador. Cualquiera con la consola abierta leía todos los PIN del negocio.
 *
 * Aquí el hash no sale nunca de la base y la comparación ocurre en el servidor.
 *
 * ── Por qué pimienta ADEMÁS de sal ────────────────────────────────────────
 * Argon2 ya pone sal por hash, que impide las tablas precomputadas. La pimienta
 * resuelve otra cosa: un PIN es de cuatro dígitos, o sea diez mil posibilidades.
 * Quien se lleve un volcado de la base las prueba todas en segundos, por muy
 * lento que sea Argon2. La pimienta vive en el entorno, no en la base, así que
 * un volcado sin ella no sirve para nada.
 */

/**
 * Parámetros de Argon2id.
 *
 * 19 MiB y 2 pasadas son el perfil de segunda recomendación de OWASP. Se elige
 * el de menos memoria a propósito: esto corre por petición en una laptop que
 * además está sirviendo la pantalla de venta, y un perfil de 64 MiB con varias
 * cajas cobrando a la vez la deja sin memoria.
 */
// `Algorithm.Argon2id` es un const enum ambiente y `verbatimModuleSyntax` no
// deja leerlo en tiempo de ejecucion. Se escribe su valor, que es parte del
// formato de Argon2 y no cambia: 0 = Argon2d, 1 = Argon2i, 2 = Argon2id.
const ARGON2ID = 2;

const PARAMETROS = {
  algorithm: ARGON2ID,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

/** Cuatro a ocho dígitos. Sin letras: el teclado del punto de venta es numérico. */
export const FORMA_PIN = /^\d{4,8}$/;

/**
 * Mezcla la pimienta ANTES de Argon2, con HMAC.
 *
 * Concatenar (`pin + pimienta`) también «funciona», pero deja que la longitud
 * del PIN se filtre en la del mensaje y no tiene separación de dominios. El
 * HMAC produce siempre 32 bytes y ata el resultado a esta pimienta concreta.
 */
function conPimienta(pin: string, pimienta: string): Buffer {
  return createHmac('sha256', pimienta).update(pin, 'utf8').digest();
}

export async function hashearPin(pin: string, pimienta: string): Promise<string> {
  return hash(conPimienta(pin, pimienta), PARAMETROS);
}

/**
 * Comprueba un PIN. Devuelve un booleano y nada más.
 *
 * Nunca lanza por un hash malformado: una fila corrupta debe leerse como «PIN
 * incorrecto», no como un 500 que le dice al atacante que ese usuario existe y
 * su registro está roto.
 */
export async function verificarPin(
  pin: string,
  hashGuardado: string,
  pimienta: string,
): Promise<boolean> {
  try {
    return await verify(hashGuardado, conPimienta(pin, pimienta), PARAMETROS);
  } catch {
    return false;
  }
}

/**
 * Bloqueo progresivo (`morphiq-prs §10`).
 *
 * Crece rápido y se detiene: 5 minutos de tope. Sin tope, un atacante que falle
 * a propósito deja al cajero fuera toda la jornada — el lockout se vuelve la
 * negación de servicio.
 */
export const INTENTOS_ANTES_DE_BLOQUEAR = 5;

export function esperaTrasFallo(intentosFallidos: number): number {
  if (intentosFallidos < INTENTOS_ANTES_DE_BLOQUEAR) return 0;
  const excedentes = intentosFallidos - INTENTOS_ANTES_DE_BLOQUEAR;
  return Math.min(30 * 2 ** excedentes, 300);
}

/** Código de enrolamiento: seis dígitos, de un solo uso. */
export function nuevoCodigoDeEnrolamiento(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

/**
 * Hash del código de enrolamiento.
 *
 * Se guarda hasheado igual que el PIN: `terminales.codigo_enrolamiento_hash` lo
 * dice en su nombre. Un código en claro en la base deja enrolar una terminal
 * pirata a quien lea esa tabla.
 */
export function hashearCodigo(codigo: string, pimienta: string): string {
  return createHmac('sha256', pimienta).update(`enrolamiento:${codigo}`, 'utf8').digest('hex');
}

export function codigoCoincide(codigo: string, hashGuardado: string, pimienta: string): boolean {
  const calculado = Buffer.from(hashearCodigo(codigo, pimienta), 'utf8');
  const guardado = Buffer.from(hashGuardado, 'utf8');
  if (calculado.length !== guardado.length) return false;
  return timingSafeEqual(calculado, guardado);
}
