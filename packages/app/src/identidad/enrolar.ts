import 'server-only';

import { createHmac, randomBytes } from 'node:crypto';

import { conTransaccion, obtenerDb, repoIdentidad } from '@morphiqpos/data';

import { codigoCoincide, hashearCodigo, nuevoCodigoDeEnrolamiento } from './pin.ts';

/**
 * Enrolamiento de terminal (F1.1-A-02).
 *
 * A-28: «Una terminal se da de alta UNA vez y queda autorizada.» El encargado
 * genera un código de seis dígitos en gestión, lo teclea en la tableta, y esa
 * tableta queda autorizada para siempre con un token de dispositivo.
 *
 * Tres propiedades, y las tres tienen prueba:
 *   · el código es de **un solo uso** — al usarlo se pone a null;
 *   · **caduca** a los quince minutos;
 *   · el token de dispositivo **se guarda hasheado**, igual que un PIN.
 */

/** Quince minutos: lo que tarda alguien en cruzar el local con la tableta. */
export const VIGENCIA_CODIGO_MINUTOS = 15;

/** Un año. La terminal se re-enrola sólo si se reinstala o se da de baja. */
export const VIGENCIA_DISPOSITIVO_SEGUNDOS = 365 * 24 * 60 * 60;

export type ResultadoEnrolamiento =
  | {
      readonly ok: true;
      readonly terminalId: string;
      readonly organizacionId: string;
      readonly sucursalId: string;
      /** En claro UNA vez: va a la cookie del dispositivo y no se vuelve a ver. */
      readonly deviceToken: string;
    }
  | { readonly ok: false; readonly motivo: 'codigo_invalido' | 'codigo_expirado' | 'ya_enrolada' };

/**
 * Canjea un código por un token de dispositivo.
 *
 * No recibe ámbito porque **todavía no hay sesión**: la terminal se identifica a
 * sí misma con el código. Es la única entrada del sistema que puede escribir sin
 * un `Ambito` previo, y por eso no pasa por `comando()`.
 */
export async function enrolarTerminal(
  codigo: string,
  pimienta: string,
  ahora: Date = new Date(),
): Promise<ResultadoEnrolamiento> {
  if (!/^\d{6}$/.test(codigo)) return { ok: false, motivo: 'codigo_invalido' };

  const db = obtenerDb();
  const terminal = await repoIdentidad.terminalPorCodigo(db, hashearCodigo(codigo, pimienta));

  // Un código que no existe y uno mal formado responden lo mismo: no se le dice
  // a quien prueba códigos si acertó el formato pero falló el número.
  if (terminal === null) return { ok: false, motivo: 'codigo_invalido' };
  if (terminal.enroladaEn !== null) return { ok: false, motivo: 'ya_enrolada' };
  if (terminal.codigoHash === null) return { ok: false, motivo: 'codigo_invalido' };
  if (!codigoCoincide(codigo, terminal.codigoHash, pimienta)) {
    return { ok: false, motivo: 'codigo_invalido' };
  }
  if (terminal.expiraEn !== null && terminal.expiraEn.getTime() <= ahora.getTime()) {
    return { ok: false, motivo: 'codigo_expirado' };
  }

  const deviceToken = randomBytes(32).toString('base64url');

  await conTransaccion((tx) =>
    repoIdentidad.completarEnrolamiento(
      tx,
      terminal.terminalId,
      hashearDispositivo(deviceToken, pimienta),
      ahora,
    ),
  );

  return {
    ok: true,
    terminalId: terminal.terminalId,
    organizacionId: terminal.organizacionId,
    sucursalId: terminal.sucursalId,
    deviceToken,
  };
}

/**
 * Genera un código nuevo para una terminal que aún no se ha enrolado.
 *
 * Devuelve el código EN CLARO una sola vez, para enseñarlo en pantalla. Lo que
 * queda en la base es su hash: quien lea `terminales` después no puede enrolar
 * un dispositivo pirata.
 */
export async function generarCodigoDeEnrolamiento(
  terminalId: string,
  pimienta: string,
  ahora: Date = new Date(),
): Promise<{ readonly codigo: string; readonly expiraEn: Date }> {
  const codigo = nuevoCodigoDeEnrolamiento();
  const expiraEn = new Date(ahora.getTime() + VIGENCIA_CODIGO_MINUTOS * 60_000);

  await conTransaccion((tx) =>
    repoIdentidad.guardarCodigoDeEnrolamiento(
      tx,
      terminalId,
      hashearCodigo(codigo, pimienta),
      expiraEn,
    ),
  );

  return { codigo, expiraEn };
}

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
