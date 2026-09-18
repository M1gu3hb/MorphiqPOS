import 'server-only';

import { PAQUETES_RESTAURANTE } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { z } from 'zod';

import { definirComando } from '../definicion.ts';

/**
 * `restaurante.tiempos_de_preparacion` — F-315.
 *
 * ── Lo que cocina ve hoy ───────────────────────────────────────────────────
 * «Hace 12 minutos», en texto relativo, sin umbral y sin color. No hay forma de
 * saber si 12 minutos es normal para ese platillo o es un desastre, y sin eso
 * no se le puede prometer un tiempo al comensal.
 *
 * ── Por platillo, no por comanda ───────────────────────────────────────────
 * El promedio de una comanda mezcla la ensalada con el corte, y el resultado no
 * sirve para nada: ni dice que la ensalada va bien ni que el corte va tarde.
 * La unidad es el ITEM, que es lo que un cocinero prepara.
 *
 * ── La desviación va en puntos base ────────────────────────────────────────
 * Por la misma razón que el dinero: un 33.333333 % redondeado distinto en dos
 * pantallas hace que dos personas discutan sobre el mismo plato.
 */

const ROLES = ['cocina', 'gerente', 'administrador', 'dueno'] as const;

export const entradaTiempos = z.object({
  dias: z.number().int().min(1).max(90).default(7),
});

export interface TiempoDeProducto {
  readonly productoId: string | null;
  readonly nombre: string;
  readonly platos: number;
  readonly minutosEstimados: number | null;
  readonly minutosMedianos: number;
  readonly desviacionBp: number | null;
}

export interface TiemposDePreparacion {
  readonly desde: string;
  readonly platos: number;
  readonly minutosMedianos: number;
  /** Los que tardaron más del doble de lo estimado. */
  readonly fueraDeTiempo: number;
  readonly porProducto: readonly TiempoDeProducto[];
}

/** Más del doble de lo estimado ya no es «un poco tarde»: es otra cosa. */
const FUERA_DE_TIEMPO_BP = 10_000;

export const tiemposDePreparacion = definirComando<
  Transaccion,
  typeof entradaTiempos,
  TiemposDePreparacion
>({
  nombre: 'restaurante.tiempos_de_preparacion',
  entidad: 'comanda',
  escribe: false,
  roles: [...ROLES],
  paquetes: PAQUETES_RESTAURANTE,
  entrada: entradaTiempos,
  async ejecutar(ctx, entrada) {
    const { organizacionId, sucursalId } = ctx.ambito;
    const desde = new Date(ctx.ahora.getTime() - entrada.dias * 24 * 60 * 60 * 1000);

    let consulta = ctx.tx
      .selectFrom('tiempos_preparacion')
      .select([
        'producto_id as productoId',
        'producto_nombre as nombre',
        'minutos_estimados as minutosEstimados',
        'minutos_reales as minutosReales',
        'desviacion_bp as desviacionBp',
      ])
      .where('organizacion_id', '=', organizacionId)
      // Un plato que todavía no sale no tiene tiempo real: promediarlo diría
      // que tardó lo que lleva en el fuego, que aún no se sabe.
      .where('listo_en', 'is not', null)
      .where('arrancado_en', '>=', desde);

    if (sucursalId !== null) {
      consulta = consulta.where('sucursal_id', '=', sucursalId);
    }

    const filas = await ctx.paso('leer_tiempos', () => consulta.execute());

    const porProducto = new Map<
      string,
      { nombre: string; estimados: number | null; reales: number[] }
    >();
    for (const fila of filas) {
      const clave = fila.productoId ?? fila.nombre;
      const actual = porProducto.get(clave) ?? {
        nombre: fila.nombre,
        estimados: fila.minutosEstimados,
        reales: [],
      };
      actual.reales.push(fila.minutosReales ?? 0);
      porProducto.set(clave, actual);
    }

    return {
      desde: desde.toISOString(),
      platos: filas.length,
      minutosMedianos: mediana(filas.map((f) => f.minutosReales ?? 0)),
      fueraDeTiempo: filas.filter((f) => (f.desviacionBp ?? 0) > FUERA_DE_TIEMPO_BP).length,
      porProducto: [...porProducto.entries()]
        .map(([productoId, datos]) => {
          const medianos = mediana(datos.reales);
          return {
            productoId: productoId === datos.nombre ? null : productoId,
            nombre: datos.nombre,
            platos: datos.reales.length,
            minutosEstimados: datos.estimados,
            minutosMedianos: medianos,
            desviacionBp: desviacion(datos.estimados, medianos),
          };
        })
        // El que más se desvía primero: es el que hay que mirar.
        .sort((a, b) => (b.desviacionBp ?? 0) - (a.desviacionBp ?? 0)),
    };
  },
});

/** Puntos base sobre el estimado. `null` cuando el menú no declara tiempo. */
function desviacion(estimados: number | null, reales: number): number | null {
  if (estimados === null || estimados === 0) return null;
  return Math.round(((reales - estimados) * 10_000) / estimados);
}

function mediana(valores: readonly number[]): number {
  if (valores.length === 0) return 0;
  const ordenados = [...valores].sort((a, b) => a - b);
  const medio = Math.floor(ordenados.length / 2);
  if (ordenados.length % 2 === 1) return ordenados[medio] ?? 0;
  return Math.round(((ordenados[medio - 1] ?? 0) + (ordenados[medio] ?? 0)) / 2);
}
