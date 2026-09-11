import 'server-only';

import { createHmac } from 'node:crypto';

/**
 * El token de dispositivo de una caja.
 *
 * Lo que queda del antiguo `enrolar.ts`. El enrolamiento por codigo de seis
 * digitos se retiro en T2 del port del restaurante: nadie lo pidio, y dejaba
 * una caja nueva sin poder vender hasta que alguien fuera a gestion a generar
 * un numero. Ahora la caja se da de alta sola la primera vez que alguien entra
 * con su PIN, y el token se sigue guardando hasheado igual que antes.
 */

/** Un año. El dispositivo se vuelve a dar de alta sólo si se reinstala. */
export const VIGENCIA_DISPOSITIVO_SEGUNDOS = 365 * 24 * 60 * 60;

/**
 * Hash del token de dispositivo.
 *
 * HMAC y no Argon2 a propósito: el token tiene 256 bits de aleatoriedad real, no
 * cuatro dígitos, así que no hay nada que fuerza bruta pueda hacer y el coste de
 * Argon2 sólo añadiría latencia a cada petición de la terminal.
 */
export function hashearDispositivo(token: string, pimienta: string): string {
  return createHmac('sha256', pimienta).update(`dispositivo:${token}`, 'utf8').digest('hex');
}
