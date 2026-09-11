import { createHmac } from 'node:crypto';

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
 *
 * **Devuelve hexadecimal, no el Buffer.** `hash()` de `@node-rs/argon2` acepta
 * un Buffer, pero `verify()` decodifica su argumento como UTF-8 y revienta con
 * `invalid utf-8 sequence` ante bytes crudos. Con el Buffer, el hash se creaba
 * bien y NINGÚN PIN podía verificarse jamás: la excepción caía en el `catch` y
 * salía como «PIN incorrecto». Nadie lo vio porque ninguna prueba hacía el
 * viaje redondo hash → verify.
 */
function conPimienta(pin: string, pimienta: string): string {
  return createHmac('sha256', pimienta).update(pin, 'utf8').digest('hex');
}

export async function hashearPin(pin: string, pimienta: string): Promise<string> {
  return hash(conPimienta(pin, pimienta), PARAMETROS);
}

/** Toda cadena de Argon2 empieza así. Lo que no, no se le pasa a la librería. */
const FORMA_HASH = /^\$argon2(?:id|i|d)\$/;

/**
 * Comprueba un PIN. Devuelve un booleano y nada más.
 *
 * Una fila corrupta se lee como «PIN incorrecto», no como un 500 que le diría
 * al atacante que ese usuario existe y su registro está roto. Pero el `catch`
 * ya no es una red para todo: **la forma del hash se comprueba antes**, así el
 * único fallo que puede llegar aquí es de datos.
 *
 * Eso importa porque este `catch` escondió durante tres sesiones un error de
 * llamada —el HMAC crudo, que `verify` no sabe decodificar— y lo devolvía como
 * PIN incorrecto. Nadie podía entrar y nada lo delataba.
 */
export async function verificarPin(
  pin: string,
  hashGuardado: string,
  pimienta: string,
): Promise<boolean> {
  if (!FORMA_HASH.test(hashGuardado)) return false;
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
