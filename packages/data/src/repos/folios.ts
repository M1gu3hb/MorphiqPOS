import 'server-only';

import { sql } from 'kysely';

import type { Transaccion } from '../cliente.ts';

/**
 * Folios consecutivos y atómicos (F1.1-A-05).
 *
 * Corrige P1-09. La fuente los generaba así:
 *
 *     `V-${fecha}-${Math.random().toString(36).slice(2,6).toUpperCase()}`
 *
 * con `unique (negocio_id, folio)` encima. Cuatro caracteres base36 son 1.6
 * millones de combinaciones: por la paradoja del cumpleaños, a las ~1500 ventas
 * del día la probabilidad de colisión pasa del 50 %. Y el fallo no aparece al
 * probar — aparece en hora pico, cuando el cobro revienta con violación de
 * unicidad y el cajero no sabe qué hacer.
 *
 * Aquí el consecutivo se toma con `UPDATE … RETURNING`, que en Postgres bloquea
 * la fila y la libera al confirmar. Dos cobros simultáneos se serializan ahí y
 * salen con folios distintos, **sin huecos**, porque si la transacción se
 * revierte el consecutivo vuelve atrás con ella.
 */

export interface FolioTomado {
  readonly serie: string;
  readonly folio: bigint;
}

/**
 * Toma el siguiente folio DENTRO de la transacción del cobro.
 *
 * `on conflict do nothing` + `coalesce` resuelve la primera venta de una
 * sucursal sin exigir que alguien haya sembrado la fila: si no existe, se crea
 * en 1; si existe, se incrementa. En una sola sentencia, así que dos primeras
 * ventas concurrentes tampoco chocan.
 */
export async function tomarFolio(
  tx: Transaccion,
  organizacionId: string,
  sucursalId: string,
  serie = 'A',
): Promise<FolioTomado> {
  await sql`
    insert into folios (organizacion_id, sucursal_id, serie, siguiente)
    values (${organizacionId}, ${sucursalId}, ${serie}, 1)
    on conflict (organizacion_id, sucursal_id, serie) do nothing
  `.execute(tx);

  const resultado = await sql<{ siguiente: bigint }>`
    update folios
       set siguiente = siguiente + 1
     where organizacion_id = ${organizacionId}
       and sucursal_id = ${sucursalId}
       and serie = ${serie}
    returning siguiente - 1 as siguiente
  `.execute(tx);

  const fila = resultado.rows[0];
  if (fila === undefined) {
    // No puede pasar tras el insert de arriba. Si pasa, algo borró la fila a
    // media transacción y confirmar el cobro sin folio dejaría una venta que no
    // se puede reclamar ni auditar.
    throw new Error(`No se pudo tomar folio para la serie ${serie} de la sucursal ${sucursalId}.`);
  }

  return { serie, folio: fila.siguiente };
}
