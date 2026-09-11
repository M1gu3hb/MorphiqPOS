import 'server-only';

import type { Transaccion } from '@morphiqpos/data';
import { sql } from 'kysely';

import { estadoItemDe, estadosItemPorDebajoDe, type EstadoComanda } from './transiciones.ts';

/**
 * Mantener coherentes `comanda_items.estado` y `orden_lineas.estado_preparacion`
 * en la MISMA transacción que mueve la comanda (F1-04 §7.5 y §10.3).
 *
 * Hoy no hay ningún vínculo entre el item de cocina y la línea de venta, y por
 * eso el estado de preparación vive duplicado y se desincroniza. Con
 * `comanda_items.orden_linea_id` los dos se mueven juntos o no se mueve
 * ninguno.
 */

/**
 * Avanza los items de esas comandas al estado que corresponde.
 *
 * El `where` sobre los estados de partida es la versión monotónica aplicada al
 * item: un item ya entregado no vuelve a `listo` porque otra comanda cambió.
 */
export async function propagarAItems(
  tx: Transaccion,
  organizacionId: string,
  comandaIds: readonly string[],
  destino: EstadoComanda,
): Promise<void> {
  const desde = estadosItemPorDebajoDe(destino);
  if (comandaIds.length === 0 || desde.length === 0) return;

  await tx
    .updateTable('comanda_items')
    .set({ estado: estadoItemDe(destino) })
    .where('organizacion_id', '=', organizacionId)
    .where('comanda_id', 'in', [...comandaIds])
    .where('estado', 'in', [...desde])
    .execute();
}

/**
 * Recalcula el estado de las líneas tocadas como el MÍNIMO de sus items.
 *
 * Una línea puede tener dos items: un producto de `area_preparacion = 'ambos'`
 * genera una comanda en cocina y otra en barra. Si la barra termina y la cocina
 * no, la línea NO está lista — y copiar el estado de la comanda que acaba de
 * moverse haría que el mesero recogiera medio plato.
 *
 * Va en una sola sentencia y no en un bucle por línea: una comanda de doce
 * platos serían doce viajes dentro de la transacción del pase.
 */
export async function recalcularEstadoDeLineas(
  tx: Transaccion,
  organizacionId: string,
  comandaIds: readonly string[],
): Promise<void> {
  if (comandaIds.length === 0) return;

  const lista = sql.join(comandaIds.map((id) => sql.val(id)));

  // El rango es el mismo orden monotónico de `transiciones.ts`, escrito aquí en
  // SQL porque el mínimo tiene que calcularlo la base: traerse los items para
  // compararlos en JavaScript sería el N+1 que `morphiq-prs §12A` prohíbe.
  await sql`
    with rangos as (
      select ci.orden_linea_id as linea_id,
             min(case ci.estado
                   when 'pendiente'      then 0
                   when 'en_preparacion' then 1
                   when 'listo'          then 2
                   when 'entregado'      then 3
                   else                       4
                 end) as rango
        from comanda_items ci
       where ci.organizacion_id = ${organizacionId}
         and ci.orden_linea_id in (
               select oli.orden_linea_id
                 from comanda_items oli
                where oli.organizacion_id = ${organizacionId}
                  and oli.comanda_id in (${lista})
                  and oli.orden_linea_id is not null)
       group by ci.orden_linea_id
    )
    update orden_lineas ol
       set estado_preparacion = case r.rango
             when 0 then 'pendiente'
             when 1 then 'en_preparacion'
             when 2 then 'listo'
             when 3 then 'entregado'
             else        'cancelado'
           end
      from rangos r
     where ol.id = r.linea_id
       and ol.organizacion_id = ${organizacionId}
  `.execute(tx);
}
