import 'server-only';

import { ErrorDominio } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { sql } from 'kysely';

import {
  ESTADOS_ITEM,
  estadoComandaDeItem,
  estadoItemDe,
  esTransicionValida,
  type EstadoComanda,
  type EstadoItem,
} from './transiciones.ts';

/**
 * El plato suelto: marcar UN item de la comanda sin tocar los demás.
 *
 * Es la razón por la que `items` deja de ser un arreglo `jsonb` y pasa a ser
 * tabla (F1-04 §10.1): la cocina marca plato por plato, en vivo, con dos
 * pantallas abiertas. Dentro de un `jsonb` eso obliga a leer, modificar y
 * reescribir el arreglo entero, que es el patrón que pierde actualizaciones.
 *
 * La comanda no se mueve a mano: se DERIVA del mínimo de sus items. Si dos
 * platos están listos y uno sigue en el fuego, la comanda no está lista.
 */

export interface ItemDeComanda {
  readonly id: string;
  readonly comandaId: string;
  readonly estado: EstadoItem;
}

export async function itemDeComanda(
  tx: Transaccion,
  organizacionId: string,
  comandaId: string,
  itemId: string,
): Promise<ItemDeComanda> {
  const fila = await tx
    .selectFrom('comanda_items')
    .select(['id', 'estado', 'comanda_id as comandaId'])
    .where('organizacion_id', '=', organizacionId)
    .where('comanda_id', '=', comandaId)
    .where('id', '=', itemId)
    .executeTakeFirst();

  if (fila === undefined) {
    throw new ErrorDominio(
      'COMANDA_NO_ENCONTRADA',
      'Ese plato ya no está en el pedido que tienes abierto.',
    );
  }
  return { id: fila.id, comandaId: fila.comandaId, estado: fila.estado as EstadoItem };
}

/**
 * Mueve un item, con el estado que leímos en el `where`.
 *
 * Cero filas significa que otra pantalla de cocina lo movió entre la lectura y
 * la escritura. Se grita: pisar el trabajo de la otra pantalla sería
 * exactamente lo que la versión monotónica existe para impedir.
 */
export async function moverItem(
  tx: Transaccion,
  organizacionId: string,
  item: ItemDeComanda,
  destino: EstadoComanda,
): Promise<void> {
  const resultado = await tx
    .updateTable('comanda_items')
    .set({ estado: estadoItemDe(destino) })
    .where('organizacion_id', '=', organizacionId)
    .where('id', '=', item.id)
    .where('estado', '=', item.estado)
    .executeTakeFirst();

  if (Number(resultado.numUpdatedRows) !== 1) {
    throw new ErrorDominio(
      'TRANSICION_INVALIDA',
      'Ese plato cambió de estado desde otra pantalla. Refresca cocina y vuelve a intentarlo.',
      { desde: item.estado, hacia: destino },
    );
  }
}

/**
 * Deja la comanda en el estado que dicen sus items: el MENOS avanzado de todos.
 *
 * Sólo avanza. Si el mínimo retrocediera —no puede, porque los items tampoco
 * retroceden— la comanda se queda como estaba en vez de deshacer un pase que la
 * cocina ya dio por terminado.
 *
 * Devuelve el estado en el que queda la comanda, que es lo que después decide
 * si la mesa avanza.
 */
export async function ajustarComandaAlMinimo(
  tx: Transaccion,
  organizacionId: string,
  comandaId: string,
  estadoActual: EstadoComanda,
  ahora: Date,
): Promise<EstadoComanda> {
  const derivado = await estadoDerivadoDeItems(tx, organizacionId, comandaId);
  if (derivado === null || derivado === estadoActual) return estadoActual;
  if (!esTransicionValida(estadoActual, derivado)) return estadoActual;

  await tx
    .updateTable('comandas')
    .set({ estado: derivado, ...selloDeTiempo(derivado, ahora) })
    .where('organizacion_id', '=', organizacionId)
    .where('id', '=', comandaId)
    .where('estado', '=', estadoActual)
    .execute();

  return derivado;
}

/** El mínimo se calcula en la base: traerse los items para compararlos sería un N+1. */
async function estadoDerivadoDeItems(
  tx: Transaccion,
  organizacionId: string,
  comandaId: string,
): Promise<EstadoComanda | null> {
  const fila = await tx
    .selectFrom('comanda_items')
    .select(
      sql<number | null>`min(case estado
             when 'pendiente'      then 0
             when 'en_preparacion' then 1
             when 'listo'          then 2
             when 'entregado'      then 3
             else                       4
           end)`.as('rango'),
    )
    .where('organizacion_id', '=', organizacionId)
    .where('comanda_id', '=', comandaId)
    .executeTakeFirst();

  const rango = fila?.rango;
  if (rango === null || rango === undefined) return null;
  return estadoComandaDeItem(ESTADOS_ITEM[rango] ?? 'pendiente');
}

/**
 * El sello que corresponde al estado derivado.
 *
 * Lleva el mismo instante que el resto del comando: si cada sello tomara su
 * propia hora, dos columnas de la misma transacción contarían tiempos distintos
 * y el `check comanda_tiempos_ordenados` acabaría dependiendo del azar.
 */
function selloDeTiempo(estado: EstadoComanda, ahora: Date): Record<string, Date> {
  if (estado === 'en_preparacion') return { iniciada_en: ahora };
  if (estado === 'listo') return { lista_en: ahora };
  if (estado === 'entregado') return { entregada_en: ahora };
  return {};
}
