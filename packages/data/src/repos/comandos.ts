import 'server-only';

import { sql } from 'kysely';

import type { Transaccion } from '../cliente.ts';

/**
 * Lo que el envoltorio `comando()` necesita de Postgres (F1.1-A-01).
 *
 * Vive aquí porque `packages/data` es «el único lugar que conoce SQL»
 * (`04-ARQUITECTURA §3`). Deliberadamente NO importa el tipo del puerto que
 * declara `packages/app`: la regla de dependencia va en el otro sentido, y
 * `app` no puede importar de `data`… al revés. Estas funciones tienen la forma
 * que el puerto pide y `app` las compone; el tipado estructural de TypeScript
 * hace el resto, sin que ninguna capa importe hacia arriba.
 */

/** El paquete contratado por la organización (A-42). */
export async function leerPaquete(tx: Transaccion, organizacionId: string): Promise<string | null> {
  const fila = await tx
    .selectFrom('organizaciones')
    .select('paquete')
    .where('id', '=', organizacionId)
    .where('activa', '=', true)
    .executeTakeFirst();

  return fila?.paquete ?? null;
}

export interface DatosReclamacion {
  readonly organizacionId: string;
  readonly comando: string;
  readonly idempotencyKey: string;
  readonly huellaEntrada: string;
  readonly identidadId: string;
  readonly correlationId: string;
}

/** Códigos SQLSTATE que interesan aquí. Se comparan por código, nunca por texto. */
const VIOLACION_DE_UNICIDAD = '23505';
const TIEMPO_DE_BLOQUEO_AGOTADO = '55P03';

/**
 * Reclama la clave DENTRO de la transacción del comando.
 *
 * El `lock_timeout` es la válvula: si otra transacción tiene la clave tomada y
 * no confirma, esta espera un rato acotado en vez de quedarse colgada. Sin él,
 * una petición atascada bloquearía la caja hasta que alguien matara el proceso.
 */
export async function reclamarClave(
  tx: Transaccion,
  datos: DatosReclamacion,
): Promise<'reclamada' | 'duplicada' | 'ocupada'> {
  await sql`set local lock_timeout = '3s'`.execute(tx);

  try {
    await tx
      .insertInto('comandos_ejecutados')
      .values({
        organizacion_id: datos.organizacionId,
        comando: datos.comando,
        idempotency_key: datos.idempotencyKey,
        huella_entrada: datos.huellaEntrada,
        identidad_id: datos.identidadId,
        correlation_id: datos.correlationId,
      })
      .execute();
    return 'reclamada';
  } catch (error) {
    const codigo = sqlstate(error);
    // Ya hay una fila confirmada con esa clave: es un reintento.
    if (codigo === VIOLACION_DE_UNICIDAD) return 'duplicada';
    // Otra ejecución la tiene tomada y sigue abierta.
    if (codigo === TIEMPO_DE_BLOQUEO_AGOTADO) return 'ocupada';
    throw error;
  }
}

export interface EjecucionGuardada {
  readonly organizacionId: string;
  readonly comando: string;
  readonly idempotencyKey: string;
  readonly huellaEntrada: string;
  readonly respuesta: unknown;
  readonly reintentos: number;
}

/**
 * Lee una ejecución ya confirmada.
 *
 * Sólo devuelve filas COMPLETADAS. Una fila con `completado_en` nulo pertenece a
 * una transacción que no ha confirmado —y por tanto es invisible para esta— o a
 * la propia transacción en curso. Devolverla sería servir una respuesta que
 * todavía no existe.
 */
export async function leerEjecucion(
  db: Transaccion,
  organizacionId: string,
  comando: string,
  idempotencyKey: string,
): Promise<EjecucionGuardada | null> {
  const fila = await db
    .selectFrom('comandos_ejecutados')
    .select([
      'organizacion_id',
      'comando',
      'idempotency_key',
      'huella_entrada',
      'respuesta',
      'reintentos',
    ])
    .where('organizacion_id', '=', organizacionId)
    .where('comando', '=', comando)
    .where('idempotency_key', '=', idempotencyKey)
    .where('completado_en', 'is not', null)
    .executeTakeFirst();

  if (fila === undefined) return null;
  return {
    organizacionId: fila.organizacion_id,
    comando: fila.comando,
    idempotencyKey: fila.idempotency_key,
    huellaEntrada: fila.huella_entrada,
    respuesta: fila.respuesta,
    reintentos: fila.reintentos,
  };
}

export async function completarEjecucion(
  tx: Transaccion,
  datos: {
    readonly organizacionId: string;
    readonly comando: string;
    readonly idempotencyKey: string;
    readonly respuesta: unknown;
    readonly ahora: Date;
  },
): Promise<void> {
  await tx
    .updateTable('comandos_ejecutados')
    .set({
      respuesta: JSON.stringify(datos.respuesta ?? null),
      completado_en: datos.ahora,
    })
    .where('organizacion_id', '=', datos.organizacionId)
    .where('comando', '=', datos.comando)
    .where('idempotency_key', '=', datos.idempotencyKey)
    .execute();
}

export async function registrarReintento(
  db: Transaccion,
  organizacionId: string,
  comando: string,
  idempotencyKey: string,
): Promise<void> {
  await db
    .updateTable('comandos_ejecutados')
    .set((eb) => ({ reintentos: eb('reintentos', '+', 1) }))
    .where('organizacion_id', '=', organizacionId)
    .where('comando', '=', comando)
    .where('idempotency_key', '=', idempotencyKey)
    .execute();
}

export interface FilaAuditoria {
  readonly organizacionId: string;
  readonly identidadId: string | null;
  readonly terminalId: string | null;
  readonly accion: string;
  readonly entidad: string;
  readonly entidadId: string | null;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly correlationId: string;
}

export async function escribirAuditoria(tx: Transaccion, fila: FilaAuditoria): Promise<void> {
  await tx
    .insertInto('auditoria')
    .values({
      organizacion_id: fila.organizacionId,
      identidad_id: fila.identidadId,
      terminal_id: fila.terminalId,
      accion: fila.accion,
      entidad: fila.entidad,
      entidad_id: fila.entidadId,
      payload: JSON.stringify(fila.payload),
      correlation_id: fila.correlationId,
    })
    .execute();
}

/** Extrae el SQLSTATE de un error de `pg` sin suponer su forma. */
function sqlstate(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const codigo = (error as { code?: unknown }).code;
  return typeof codigo === 'string' ? codigo : null;
}
