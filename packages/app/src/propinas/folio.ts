import 'server-only';

import type { Transaccion } from '@morphiqpos/data';
import { sql } from 'kysely';

/**
 * El folio de la liquidación, consecutivo POR ORGANIZACIÓN.
 *
 * ── El defecto que cierra (bloqueante del veredicto) ───────────────────────
 * Antes de esto el folio se tomaba con `repoFolios.tomarFolio(tx, org, sucursal,
 * 'LIQ')`, que es un contador **por sucursal**: `folios` tiene
 * `primary key (organizacion_id, sucursal_id, serie)` (`001_plataforma.sql:202-208`).
 * Y la fila se inserta contra `liquidaciones_folio_unico`, que es
 * `unique (organizacion_id, serie, folio)` **sin sucursal**
 * (`046_restricciones_restaurante.sql:51-52`).
 *
 * Las dos cosas juntas cierran la puerta a la segunda sucursal para siempre:
 * Centro liquida y se lleva LIQ-000001; Norte toma su propio contador, que
 * también arranca en 1, y el `INSERT` choca con `23505`. El envoltorio lo
 * traduce a ERROR_INTERNO y revierte la transacción entera — incluido el
 * incremento del contador, porque `repos/folios.ts:20-23` dice explícitamente
 * que el consecutivo vuelve atrás con la reversión. El contador de Norte queda
 * otra vez en 1 y el siguiente intento vuelve a chocar. No es intermitente:
 * Norte no puede liquidar nunca.
 *
 * ── Por qué el arreglo es éste y no otro ───────────────────────────────────
 * El índice de la base es la autoridad: dice que el folio de liquidación es
 * único POR ORGANIZACIÓN. Entonces el contador tiene que ser por organización,
 * y `folios` no puede darlo: su `sucursal_id` es `not null` y con FK a
 * `sucursales`, así que no existe ninguna fila «de toda la organización» que
 * tomar, ni se puede inventar una sin romper la FK. Elegir una sucursal ancla
 * (la más antigua, por ejemplo) tampoco sirve: `folios` cae con
 * `on delete cascade` si esa sucursal se borra, el contador volvería a 1 y
 * reaparecería la colisión, esta vez en la sucursal principal.
 *
 * Así que el consecutivo se deriva de la propia tabla —`max(folio) + 1` acotado
 * a organización y serie, que es exactamente lo que el índice único declara— y
 * la carrera entre dos sucursales se serializa con un cerrojo consultivo de
 * TRANSACCIÓN. `pg_advisory_xact_lock` se libera solo al confirmar o al
 * revertir, así que no hay forma de olvidarse de soltarlo ni de dejarlo colgado
 * si el comando falla a mitad. Mientras un cerrojo está tomado, la otra
 * sucursal espera y lee un `max` que ya incluye la fila de la primera.
 *
 * Lo correcto de verdad sería que el índice coincidiera con el contador:
 * `unique (organizacion_id, sucursal_id, serie, folio)`, igual que
 * `ordenes_folio_unico` (`003:173-175`) y `cortes_folio_unico` (`046:44-46`).
 * Eso es una migración, y las migraciones están fuera del perímetro de este
 * módulo: queda anotado en el informe. Hasta entonces manda el índice que la
 * base tiene HOY, y este archivo se ajusta a él.
 *
 * ── Por qué `max()` no deja huecos ni reutiliza ────────────────────────────
 * `liquidaciones_propina` no se borra: todas sus FK son `on delete restrict`
 * (`045:648-685`) y no hay comando que la elimine. Si algún día lo hubiera,
 * `max() + 1` reutilizaría el folio de la fila borrada, y eso hay que resolverlo
 * entonces con una secuencia propia, no con este archivo.
 */

/**
 * Espacio de nombres del cerrojo.
 *
 * `pg_advisory_xact_lock(int4, int4)` toma DOS claves, y la primera se usa aquí
 * como clase: aísla este cerrojo de cualquier otro que otro módulo pida sobre la
 * misma organización. Con una sola clave, dos funciones distintas que hashearan
 * el mismo id se bloquearían entre sí sin que nadie entendiera por qué.
 */
export const CLASE_DE_CERROJO = 'morphiqpos.propinas.folio_de_liquidacion';

export interface FolioDeLiquidacion {
  readonly serie: string;
  readonly folio: bigint;
}

/**
 * Toma el siguiente folio de la serie, DENTRO de la transacción del comando.
 *
 * No se puede llamar fuera de una transacción: `pg_advisory_xact_lock` en
 * autocommit se libera al instante y el cerrojo dejaría de proteger nada.
 * `Transaccion` es justamente el tipo que impide pasar aquí una conexión suelta.
 */
export async function tomarFolioDeLiquidacion(
  tx: Transaccion,
  organizacionId: string,
  serie: string,
): Promise<FolioDeLiquidacion> {
  await sql`
    select pg_advisory_xact_lock(
      hashtext(${CLASE_DE_CERROJO}::text),
      hashtext(${organizacionId}::text || ':' || ${serie}::text)
    )
  `.execute(tx);

  // `::text` y no un `bigint` del driver: `max(bigint)` vuelve de Postgres como
  // texto en unas rutas y como `bigint` en otras según el parser de tipos, y un
  // folio que pase por `number` deja de ser exacto a partir de 2^53 (R15).
  const resultado = await sql<{ siguiente: string }>`
    select (coalesce(max(l.folio), 0) + 1)::text as siguiente
      from liquidaciones_propina l
     where l.organizacion_id = ${organizacionId}
       and l.serie = ${serie}
  `.execute(tx);

  const fila = resultado.rows[0];
  if (fila === undefined) {
    // Un agregado sin `group by` devuelve siempre una fila. Si no la devuelve,
    // confirmar la liquidación sin folio dejaría un pago de propinas que nadie
    // puede reclamar ni dictar por teléfono.
    throw new Error(
      `No se pudo derivar el folio de la serie ${serie} para la organización ${organizacionId}.`,
    );
  }

  return { serie, folio: BigInt(fila.siguiente) };
}
