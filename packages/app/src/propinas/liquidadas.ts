import 'server-only';

import type { Transaccion } from '@morphiqpos/data';
import { sql } from 'kysely';

import type { PropinaDeMesero, RenglonDePago } from './desglose.ts';
import {
  aMesero,
  aRenglon,
  NOMBRE_DEL_MESERO,
  PROPINA_DE_LA_ORDEN,
  TIENE_PROPINA_CONFIRMADA,
  type FilaDeMesero,
  type FilaDeMetodo,
} from './fragmentos.ts';
import { condicionPendiente, type FiltroDePropinas } from './repositorio.ts';

/**
 * Lo que se lee DESPUÉS de reclamar, acotado a las órdenes de una liquidación.
 *
 * Vive aparte de `repositorio.ts` porque la pregunta es otra: allí es «qué queda
 * pendiente en este periodo», aquí es «qué entró exactamente en esta
 * liquidación». La segunda no admite tope ni filtro de fecha: el conjunto ya
 * está cerrado por el `UPDATE`, y sumar sobre otra cosa daría un total distinto
 * del que se acaba de marcar.
 */

export interface Reclamacion {
  readonly filtro: FiltroDePropinas;
  readonly liquidacionId: string;
  readonly ahora: Date;
  /** Nulo = todo lo pendiente del periodo. Con lista, sólo esas órdenes. */
  readonly ordenIds: readonly string[] | null;
}

/**
 * Marca las órdenes del periodo con su liquidación, y devuelve cuáles marcó.
 *
 * Es LA protección de este comando, y es un solo `UPDATE`: la guarda
 * `propina_liquidacion_id is null` va en el `WHERE`, así que dos liquidaciones
 * simultáneas del mismo periodo se serializan en la fila y la segunda no vuelve
 * a reclamar lo que la primera ya marcó. No hay ningún `if` previo que otra
 * transacción pueda invalidar entre la lectura y la escritura — que es
 * exactamente el hueco por el que hoy se liquida dos veces la misma propina
 * (`LiquidarPropinasDialog.jsx:113-126`).
 *
 * El predicado es el MISMO `condicionPendiente` que usó la consulta que le
 * enseñó la lista al administrador. Si fueran dos copias, la pantalla enseñaría
 * ocho ventas y el botón marcaría siete.
 */
export async function reclamarOrdenes(
  tx: Transaccion,
  reclamacion: Reclamacion,
): Promise<string[]> {
  const ids = reclamacion.ordenIds === null ? null : [...reclamacion.ordenIds];
  const filas = await sql<{ id: string }>`
    update ordenes as o
       set propina_liquidacion_id = ${reclamacion.liquidacionId}::uuid,
           propina_liquidada_en   = ${reclamacion.ahora}
     where ${condicionPendiente(reclamacion.filtro)}
       and (${ids}::uuid[] is null or o.id = any(${ids}::uuid[]))
       and ${TIENE_PROPINA_CONFIRMADA}
    returning o.id
  `.execute(tx);

  return filas.rows.map((fila) => fila.id);
}

/** Desglose por método de un conjunto de órdenes ya reclamado. */
export async function desgloseDeOrdenes(
  tx: Transaccion,
  organizacionId: string,
  ordenIds: readonly string[],
): Promise<RenglonDePago[]> {
  const filas = await sql<FilaDeMetodo>`
    select pg.metodo,
           coalesce(sum(pg.monto_centavos), 0)::text   as ventas,
           coalesce(sum(pg.propina_centavos), 0)::text as propinas
      from pagos pg
     where pg.organizacion_id = ${organizacionId}
       and pg.estado = 'confirmado'
       and pg.orden_id = any(${[...ordenIds]}::uuid[])
     group by pg.metodo
  `.execute(tx);

  return filas.rows.map(aRenglon);
}

/**
 * El reparto por mesero de una liquidación.
 *
 * Es el `desglose_meseros` que `LiquidarPropinasDialog.jsx:106` guarda hoy como
 * cadena JSON y que nadie parsea nunca. Se DERIVA de
 * `ordenes.propina_liquidacion_id` (F1-04 §30.1): guardar además la lista
 * serializada es guardar el mismo dato dos veces, en un formato que no se puede
 * consultar y que no se puede usar para revertir nada.
 */
export async function propinasPorMeseroDeOrdenes(
  tx: Transaccion,
  organizacionId: string,
  ordenIds: readonly string[],
): Promise<PropinaDeMesero[]> {
  const filas = await sql<FilaDeMesero>`
    select o.empleado_atiende_id as empleado_id,
           max(per.nombre)       as nombre,
           count(*)::text        as ventas,
           sum(t.propina)::text  as propina
      from ordenes o
      ${PROPINA_DE_LA_ORDEN}
      ${NOMBRE_DEL_MESERO}
     where o.organizacion_id = ${organizacionId}
       and o.id = any(${[...ordenIds]}::uuid[])
       and t.propina > 0
     group by o.empleado_atiende_id
     order by sum(t.propina) desc
  `.execute(tx);

  return filas.rows.map(aMesero);
}

/**
 * De las órdenes pedidas, cuáles quedaron apuntando a OTRA liquidación.
 *
 * Se pregunta después del `UPDATE`, no antes: antes sería una lectura que otra
 * transacción puede invalidar entre la comprobación y la escritura, que es
 * justamente el defecto que este comando cierra.
 */
export async function ordenesDeOtraLiquidacion(
  tx: Transaccion,
  organizacionId: string,
  ordenIds: readonly string[],
  liquidacionId: string,
): Promise<string[]> {
  const filas = await sql<{ id: string }>`
    select o.id
      from ordenes o
     where o.organizacion_id = ${organizacionId}
       and o.id = any(${[...ordenIds]}::uuid[])
       and o.propina_liquidacion_id is not null
       and o.propina_liquidacion_id is distinct from ${liquidacionId}::uuid
  `.execute(tx);

  return filas.rows.map((fila) => fila.id);
}
