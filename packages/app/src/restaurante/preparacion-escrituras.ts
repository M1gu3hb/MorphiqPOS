import 'server-only';

import { ErrorDominio } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';

import { mesaOperable, quedanComandasActivas } from './datos.ts';
import { mesaTrasComanda, type EstadoComanda } from './transiciones.ts';

/**
 * Las escrituras del ciclo de preparación, y la sincronía con la mesa.
 *
 * Aparte de `preparacion.ts` para que allí se lea la REGLA —qué estado sigue a
 * qué estado, y cuándo la mesa avanza— sin que la tape el SQL que la cumple.
 */

interface DatosDeMovimiento {
  readonly organizacionId: string;
  readonly comandaId: string;
  readonly desde: EstadoComanda;
  readonly hacia: EstadoComanda;
  readonly empleoId: string;
  readonly ahora: Date;
}

export async function moverComanda(tx: Transaccion, datos: DatosDeMovimiento): Promise<void> {
  const resultado = await tx
    .updateTable('comandas')
    .set({
      estado: datos.hacia,
      ...selloDeTiempo(datos.hacia, datos.ahora),
      // Quien pone el pedido en el fuego se queda como responsable. Hoy esta
      // columna nunca se escribe (F1-04 §10.2) y la cocina por estaciones la
      // necesita para saber quién tiene cada pase.
      ...(datos.hacia === 'en_preparacion' ? { empleado_responsable_id: datos.empleoId } : {}),
    })
    .where('organizacion_id', '=', datos.organizacionId)
    .where('id', '=', datos.comandaId)
    // La otra mitad de la monotonía: si otra pantalla movió la comanda entre la
    // lectura y esta escritura, aquí se actualizan cero filas.
    .where('estado', '=', datos.desde)
    .executeTakeFirst();

  if (Number(resultado.numUpdatedRows) !== 1) {
    throw new ErrorDominio(
      'TRANSICION_INVALIDA',
      'Ese pedido cambió de estado desde otra pantalla. Refresca cocina y vuelve a intentarlo.',
      { desde: datos.desde, hacia: datos.hacia },
    );
  }
}

/**
 * Los sellos de tiempo de la comanda.
 *
 * `iniciada_en` no se rellena al saltar directo a `listo`: el `check
 * comanda_tiempos_ordenados` admite que sea nula, y fabricar una hora de inicio
 * que nadie vivió mentiría en el tiempo de preparación que la cocina mide.
 */
function selloDeTiempo(hacia: EstadoComanda, ahora: Date): Record<string, Date> {
  if (hacia === 'en_preparacion') return { iniciada_en: ahora };
  if (hacia === 'listo') return { lista_en: ahora };
  if (hacia === 'entregado') return { entregada_en: ahora };
  return {};
}

export async function marcarEntregadas(
  tx: Transaccion,
  organizacionId: string,
  ids: readonly string[],
  ahora: Date,
): Promise<void> {
  await tx
    .updateTable('comandas')
    .set({ estado: 'entregado', entregada_en: ahora })
    .where('organizacion_id', '=', organizacionId)
    .where('id', 'in', [...ids])
    .where('estado', '=', 'listo')
    .execute();
}

interface DatosDeSincronia {
  readonly organizacionId: string;
  readonly ordenId: string;
  readonly mesaId: string | null;
  readonly comandasMovidas: readonly string[];
  readonly estadoComanda: EstadoComanda;
}

/** Mueve la mesa si la tabla de F1-04 §8.2 dice que le toca. */
export async function sincronizarMesa(
  tx: Transaccion,
  datos: DatosDeSincronia,
): Promise<string | null> {
  const mesaId = datos.mesaId;
  if (mesaId === null) return null;

  const mesa = await mesaOperable(tx, datos.organizacionId, mesaId);
  // Las comandas que se acaban de mover se excluyen: dentro de la transacción
  // ya no están activas, pero preguntarlo así deja explícito el porqué.
  const quedan = await quedanComandasActivas(
    tx,
    datos.organizacionId,
    datos.ordenId,
    datos.comandasMovidas,
  );

  const destino = mesaTrasComanda(mesa.estado, datos.estadoComanda, quedan);
  if (destino === null) return null;

  await tx
    .updateTable('mesas')
    .set({ estado: destino })
    .where('organizacion_id', '=', datos.organizacionId)
    .where('id', '=', mesaId)
    .execute();

  return destino;
}
