import 'server-only';

import { conTransaccion, obtenerDb, repoIdentidad, repoSesion } from '@morphiqpos/data';

import { DURACION_SESION_SEGUNDOS, firmarSesion, nuevoIdDeSesion } from '../sesion/token.ts';
import { esperaTrasFallo, FORMA_PIN, INTENTOS_ANTES_DE_BLOQUEAR, verificarPin } from './pin.ts';
import { hashearDispositivo } from './enrolar.ts';

/**
 * Entrada con PIN (F1.1-A-03).
 *
 * No pasa por `comando()` porque `comando()` exige un `Ambito` y aquí es donde
 * el ámbito nace. Lo que sí conserva es todo lo demás: valida la entrada, falla
 * cerrado, cuenta intentos y no filtra por qué falló.
 *
 * ── La respuesta es siempre la misma ──────────────────────────────────────
 * PIN incorrecto, empleo inexistente, terminal no enrolada: `credenciales`. Un
 * mensaje distinto por caso deja enumerar qué empleos existen probando ids
 * (`morphiq-prs §10`). El servidor sí distingue —lo audita— pero no lo dice.
 */

export interface PeticionEntrar {
  readonly empleoId: string;
  readonly pin: string;
  /** Token de dispositivo de la cookie de la terminal. */
  readonly deviceToken: string;
  readonly pimienta: string;
  readonly secretoSesion: string;
}

export type ResultadoEntrar =
  | {
      readonly ok: true;
      readonly token: string;
      readonly maxEdadSegundos: number;
      readonly organizacionId: string;
      readonly rol: string;
    }
  | {
      readonly ok: false;
      readonly motivo: 'credenciales' | 'bloqueada' | 'terminal';
      /** Segundos que faltan para poder reintentar. Sólo en `bloqueada`. */
      readonly esperaSegundos?: number;
    };

export async function entrarConPin(
  peticion: PeticionEntrar,
  ahora: Date = new Date(),
): Promise<ResultadoEntrar> {
  if (!FORMA_PIN.test(peticion.pin)) return { ok: false, motivo: 'credenciales' };

  const db = obtenerDb();

  // 1 · La terminal identifica la organización. El cliente no la elige (R16).
  const terminal = await terminalPorToken(peticion.deviceToken, peticion.pimienta);
  if (terminal === null) return { ok: false, motivo: 'terminal' };

  // 2 · La credencial, buscada por empleo dentro de ESA organización.
  const credencial = await repoIdentidad.credencialParaVerificar(
    db,
    terminal.organizacionId,
    peticion.empleoId,
  );
  if (credencial === null) return { ok: false, motivo: 'credenciales' };

  // 3 · Bloqueo activo: ni siquiera se comprueba el PIN.
  if (credencial.bloqueadaHasta !== null && credencial.bloqueadaHasta.getTime() > ahora.getTime()) {
    const restan = Math.ceil((credencial.bloqueadaHasta.getTime() - ahora.getTime()) / 1000);
    return { ok: false, motivo: 'bloqueada', esperaSegundos: restan };
  }

  // 4 · Argon2id con pimienta, en el servidor.
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

  // 5 · El ámbito se resuelve desde la base, no desde lo que llegó.
  const ambito = await repoSesion.resolverAmbito(db, credencial.identidadId, credencial.empleoId);
  if (ambito === null) return { ok: false, motivo: 'credenciales' };

  await conTransaccion((tx) => repoIdentidad.limpiarIntentos(tx, credencial.credencialId));

  const token = firmarSesion(
    {
      sid: nuevoIdDeSesion(),
      identidadId: credencial.identidadId,
      empleoId: credencial.empleoId,
      terminalId: terminal.terminalId,
      exp: Math.floor(ahora.getTime() / 1000) + DURACION_SESION_SEGUNDOS,
    },
    peticion.secretoSesion,
  );

  return {
    ok: true,
    token,
    maxEdadSegundos: DURACION_SESION_SEGUNDOS,
    organizacionId: ambito.organizacionId,
    rol: ambito.rol,
  };
}

/** Quién puede entrar en esta terminal. Nombre y rol; nunca el hash. */
export async function empleadosDeLaTerminal(
  deviceToken: string,
  pimienta: string,
): Promise<repoIdentidad.EmpleadoParaEntrar[]> {
  const terminal = await terminalPorToken(deviceToken, pimienta);
  if (terminal === null) return [];
  return repoIdentidad.empleadosConPin(obtenerDb(), terminal.organizacionId, terminal.sucursalId);
}

interface TerminalIdentificada {
  readonly terminalId: string;
  readonly organizacionId: string;
  readonly sucursalId: string;
}

async function terminalPorToken(
  deviceToken: string,
  pimienta: string,
): Promise<TerminalIdentificada | null> {
  if (deviceToken === '') return null;
  const fila = await obtenerDb()
    .selectFrom('terminales')
    .select(['id as terminalId', 'organizacion_id as organizacionId', 'sucursal_id as sucursalId'])
    .where('device_token_hash', '=', hashearDispositivo(deviceToken, pimienta))
    .where('activa', '=', true)
    .where('enrolada_en', 'is not', null)
    .executeTakeFirst();
  return fila ?? null;
}
