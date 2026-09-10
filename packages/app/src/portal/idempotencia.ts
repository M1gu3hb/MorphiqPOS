import 'server-only';

import type { Transaccion } from '@morphiqpos/data';
import { sql } from 'kysely';

import { sqlstate } from './errores-sql.ts';

/**
 * La clave de idempotencia de un comensal (R10).
 *
 * El resto de la idempotencia —leer una ejecución confirmada, cerrarla, contar
 * el reintento— son las funciones de `repoComandos` que ya usa el envoltorio de
 * empleado. Aquí sólo vive la reclamación, y sólo por un motivo concreto que
 * está escrito abajo.
 */

/** La migración 010 exige entre 8 y 200 caracteres. Aquí se corta el mínimo. */
export const CLAVE_MINIMA = 8;

/**
 * Reclama la clave de idempotencia SIN identidad.
 *
 * Es el único trozo de `repoComandos.reclamarClave` que hay que repetir, y no
 * por gusto: aquella declara `identidadId: string` y el comensal no tiene
 * identidad. La columna `comandos_ejecutados.identidad_id` SÍ admite nulo
 * (migración 010), así que la fila es válida. Cuando se pueda tocar
 * `packages/data`, la corrección es ensanchar aquel parámetro a `string | null`
 * y borrar esta función; queda anotado en el informe.
 *
 * El `lock_timeout` y la lectura de los dos SQLSTATE son los mismos de allí, y
 * por la misma razón: sin él, dos peticiones con la misma clave dejan la
 * segunda esperando indefinidamente.
 *
 * ── Lo que aquí SÍ cambia: el punto de guardado ───────────────────────────
 * Un error deja la transacción abortada, así que después de un 23505 la
 * siguiente sentencia falla con `25P02` sin ejecutarse. Quien llama necesita
 * justo eso —volver a leer la ejecución confirmada para devolver su respuesta—,
 * de modo que el `insert` va entre `savepoint` y `rollback to savepoint`. Sin
 * él, dos peticiones simultáneas con la misma clave devuelven un 500 en vez del
 * resultado guardado, que es exactamente lo contrario de ser idempotente.
 */
export async function reclamarClaveAnonima(
  tx: Transaccion,
  datos: {
    readonly organizacionId: string;
    readonly comando: string;
    readonly idempotencyKey: string;
    readonly huellaEntrada: string;
    readonly correlationId: string;
  },
): Promise<'reclamada' | 'duplicada' | 'ocupada'> {
  await sql`set local lock_timeout = '3s'`.execute(tx);
  await sql`savepoint reclamo_de_clave`.execute(tx);

  try {
    await tx
      .insertInto('comandos_ejecutados')
      .values({
        organizacion_id: datos.organizacionId,
        comando: datos.comando,
        idempotency_key: datos.idempotencyKey,
        huella_entrada: datos.huellaEntrada,
        identidad_id: null,
        correlation_id: datos.correlationId,
      })
      .execute();
    await sql`release savepoint reclamo_de_clave`.execute(tx);
    return 'reclamada';
  } catch (error) {
    await sql`rollback to savepoint reclamo_de_clave`.execute(tx);
    const codigo = sqlstate(error);
    if (codigo === '23505') return 'duplicada';
    if (codigo === '55P03') return 'ocupada';
    throw error;
  }
}
