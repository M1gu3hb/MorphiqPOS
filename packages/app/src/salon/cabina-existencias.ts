import 'server-only';

import { PAQUETES_TODOS } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { z } from 'zod';

import { definirComando } from '../definicion.ts';
import { almacenesDelSalon } from './cabina.ts';

/**
 * `cabina.existencias` — cuánto hay de cada producto del salón EN CADA LUGAR: en el
 * anaquel, en piezas; en la cabina, en su unidad (C.10 de la 2.4).
 *
 * ── Por qué no alcanza con la existencia del puente ──────────────────────
 * El puente sirve `existencia` sumando TODOS los almacenes (`existencias_por_insumo`). Un
 * tinte que se vende en el anaquel y se abre en la cabina guarda piezas en uno y gramos
 * en el otro, y sumarlos da un número que no es ni piezas ni gramos. La pantalla de
 * productos del salón no lo pintaba —«existencias no llegan en esta lectura»— y hacía
 * bien: aquí se leen separados, cada uno en su unidad.
 */

const CABINA = ['mesero', 'cajero', 'gerente', 'administrador', 'dueno'] as const;

export const entradaExistenciasDelSalon = z.object({});

export interface ExistenciaDelSalon {
  readonly productoId: string;
  /** El insumo que el anaquel y la cabina comparten: su kardex es el de este id. */
  readonly insumoId: string;
  /** En piezas. */
  readonly enAnaquel: string;
  /** En la unidad de cabina (ml, g); nulo si el producto no se abre en cabina. */
  readonly enCabina: string | null;
  readonly unidadCabina: string | null;
}

export const existenciasDelSalon = definirComando<
  Transaccion,
  typeof entradaExistenciasDelSalon,
  { readonly existencias: readonly ExistenciaDelSalon[] }
>({
  nombre: 'cabina.existencias',
  entidad: 'almacen',
  escribe: false,
  roles: [...CABINA],
  paquetes: PAQUETES_TODOS,
  entrada: entradaExistenciasDelSalon,
  async ejecutar(ctx) {
    const { organizacionId } = ctx.ambito;
    const almacenes = await almacenesDelSalon(ctx);
    const productos = await ctx.paso('leer_productos', () =>
      ctx.tx
        .selectFrom('productos')
        .select(['id', 'insumo_base_id', 'destino', 'unidad_cabina'])
        .where('organizacion_id', '=', organizacionId)
        .where('activo', '=', true)
        .where('insumo_base_id', 'is not', null)
        .execute(),
    );
    const insumoIds = [
      ...new Set(productos.map((p) => p.insumo_base_id).filter((id): id is string => id !== null)),
    ];
    if (insumoIds.length === 0) return { existencias: [] };

    const filas = await ctx.paso('leer_existencias', () =>
      ctx.tx
        .selectFrom('existencias')
        .select(['almacen_id', 'insumo_id', 'cantidad'])
        .where('organizacion_id', '=', organizacionId)
        .where('almacen_id', 'in', [almacenes.venta, almacenes.cabina])
        .where('insumo_id', 'in', insumoIds)
        .execute(),
    );
    const cantidad = (almacenId: string, insumoId: string): string =>
      filas.find((f) => f.almacen_id === almacenId && f.insumo_id === insumoId)?.cantidad ?? '0';

    return {
      existencias: productos.flatMap((p) => {
        if (p.insumo_base_id === null) return [];
        const seAbre = p.destino !== 'venta' && p.unidad_cabina != null;
        return [
          {
            productoId: p.id,
            insumoId: p.insumo_base_id,
            enAnaquel: cantidad(almacenes.venta, p.insumo_base_id),
            enCabina: seAbre ? cantidad(almacenes.cabina, p.insumo_base_id) : null,
            unidadCabina: seAbre ? (p.unidad_cabina ?? null) : null,
          },
        ];
      }),
    };
  },
});
