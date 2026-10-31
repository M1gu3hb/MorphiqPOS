import { conTransaccion, obtenerDb } from '@morphiqpos/data';

import { comando } from '../../produccion.ts';
import { clave } from '../../pruebas/negocio-real.ts';
import { unirMesasComando } from '../union-de-mesas.ts';
import { ambitoDeCaja, sembrarSalon, type Salon } from './salon-real.ts';

/**
 * EL PLANO DE LAS PRUEBAS DE UNIR MESAS (DP-9.6): un salón con sus mesas en fila, separadas, y
 * `unir` con las posiciones en que quedan al juntarlas.
 */

/** Medianas redondas: 80 × 80 en el plano. */
export const LADO = 80;

export async function salonEnFila(nombre: string, mesas = 4): Promise<Salon> {
  const salon = await sembrarSalon({ nombre, mesas, terminales: 1 });
  await conTransaccion(async (tx) => {
    for (const [i, id] of salon.mesas.entries()) {
      await tx
        .updateTable('mesas')
        .set({ posicion_x: 100 + i * 200, posicion_y: 100, forma: 'redonda', tamano: 'mediana' })
        .where('id', '=', id)
        .execute();
    }
  });
  return salon;
}

export const mesa = (salon: Salon, i: number) => salon.mesas[i] ?? '';

export function unir(
  salon: Salon,
  principal: number,
  otras: readonly number[],
  posiciones?: readonly { i: number; x: number; y: number }[],
) {
  return comando(unirMesasComando, {
    entrada: {
      mesaPrincipalId: mesa(salon, principal),
      mesaIds: otras.map((i) => mesa(salon, i)),
      ...(posiciones === undefined
        ? {}
        : { posiciones: posiciones.map((p) => ({ mesaId: mesa(salon, p.i), x: p.x, y: p.y })) }),
    },
    ambito: ambitoDeCaja(salon),
    idempotencyKey: clave(),
  });
}

export async function posicion(id: string) {
  const fila = await obtenerDb()
    .selectFrom('mesas')
    .select(['posicion_x', 'posicion_y'])
    .where('id', '=', id)
    .executeTakeFirstOrThrow();
  return [fila.posicion_x, fila.posicion_y];
}
