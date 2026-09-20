import 'server-only';

import { ErrorDominio, PAQUETES_TODOS } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { valuarInventario, type ArticuloParaValuar } from '@morphiqpos/domain/inventario';
import { z } from 'zod';

import { definirComando } from '../definicion.ts';

/**
 * F-108 · El corte de valuación: cuánto dinero hay dormido, y desde cuándo.
 *
 * ── Lo que estaba mal ──────────────────────────────────────────────────────
 * La 062 creaba `valuaciones_inventario` y `valuacion_lineas`, y no había
 * comando que escribiera ni una fila. El catálogo lo listaba como «parcial»; en
 * la práctica era cero.
 *
 * ── Por qué se GUARDA en vez de calcularse al vuelo ────────────────────────
 * Porque la pregunta útil no es «cuánto vale hoy» sino «cuánto llevo dormido y
 * desde cuándo». Un cálculo al vuelo contesta la primera y no la segunda: los
 * costos cambian, las existencias cambian, y dentro de seis meses no hay forma
 * de reconstruir cuánto valía el almacén en marzo. La foto se toma y se guarda.
 *
 * ── Y por qué lleva el detalle por artículo ────────────────────────────────
 * Un total sin detalle es un número que nadie puede auditar. El primer
 * desacuerdo —«no puede ser, si acabo de vender casi todo»— lo vuelve inútil, y
 * entonces deja de mirarse.
 */

const ROLES = ['gerente', 'administrador', 'dueno'] as const;

export const entradaValuar = z.object({
  /** Sin él, se valúan todos los almacenes de la organización. */
  almacenId: z.uuid().optional(),
  metodo: z.enum(['promedio', 'peps']).default('promedio'),
  /** A partir de cuántos días cuenta como dormido. 180 es el del giro. */
  umbralDias: z.number().int().min(30).max(1095).default(180),
});

export interface ResultadoValuacion {
  readonly valuacionId: string;
  readonly metodo: string;
  readonly valorCentavos: string;
  readonly articulos: number;
  /** El valor de lo que no se mueve. Es la mitad que dispara la decisión. */
  readonly valorDormidoCentavos: string;
  readonly umbralDias: number;
}

export const tomarValuacion = definirComando<Transaccion, typeof entradaValuar, ResultadoValuacion>(
  {
    nombre: 'inventario.valuar',
    entidad: 'valuacion_inventario',
    escribe: true,
    roles: [...ROLES],
    paquetes: PAQUETES_TODOS,
    modulo: 'costos_basicos',
    entrada: entradaValuar,
    async ejecutar(ctx, entrada) {
      const { organizacionId, empleoId } = ctx.ambito;

      const filas = await ctx.paso('leer_existencias', () => {
        let consulta = ctx.tx
          .selectFrom('existencias')
          .innerJoin('insumos', 'insumos.id', 'existencias.insumo_id')
          .select([
            'existencias.insumo_id as insumo_id',
            'existencias.cantidad as cantidad',
            'insumos.costo_unitario_centavos as costo',
            'existencias.actualizado_en as actualizado_en',
          ])
          .where('existencias.organizacion_id', '=', organizacionId)
          .where('insumos.activo', '=', true);

        if (entrada.almacenId !== undefined) {
          consulta = consulta.where('existencias.almacen_id', '=', entrada.almacenId);
        }
        return consulta.execute();
      });

      if (filas.length === 0) {
        throw new ErrorDominio(
          'INVENTARIO_INVALIDO',
          'No hay existencias que valuar en ese almacén.',
        );
      }

      const articulos: ArticuloParaValuar[] = filas.map((f) => ({
        insumoId: f.insumo_id,
        existencia: f.cantidad,
        costoPromedioCentavos: f.costo,
        ultimoMovimiento: f.actualizado_en,
      }));

      const valuacion = valuarInventario(articulos, {
        metodo: entrada.metodo,
        ahora: ctx.ahora,
        umbralDias: entrada.umbralDias,
      });

      const cabecera = await ctx.paso('guardar_valuacion', () =>
        ctx.tx
          .insertInto('valuaciones_inventario')
          .values({
            organizacion_id: organizacionId,
            almacen_id: entrada.almacenId ?? null,
            metodo: valuacion.metodo,
            tomada_en: ctx.ahora,
            valor_centavos: valuacion.valorCentavos,
            articulos: valuacion.articulos,
            empleado_id: empleoId,
          })
          .returning('id')
          .executeTakeFirstOrThrow(),
      );

      // El detalle, en un solo `insert`. Uno por artículo sería una consulta por
      // cada clave del catálogo: seis mil en una ferretería.
      await ctx.paso('guardar_lineas', () =>
        ctx.tx
          .insertInto('valuacion_lineas')
          .values(
            valuacion.lineas.map((l) => ({
              valuacion_id: cabecera.id,
              insumo_id: l.insumoId,
              cantidad: l.cantidad,
              costo_unitario_centavos: l.costoUnitarioCentavos,
              valor_centavos: l.valorCentavos,
            })),
          )
          .execute(),
      );

      ctx.auditar({
        entidadId: cabecera.id,
        payload: {
          metodo: valuacion.metodo,
          articulos: valuacion.articulos,
          valorCentavos: valuacion.valorCentavos.toString(),
          valorDormidoCentavos: valuacion.valorDormidoCentavos.toString(),
        },
      });

      return {
        valuacionId: cabecera.id,
        metodo: valuacion.metodo,
        valorCentavos: valuacion.valorCentavos.toString(),
        articulos: valuacion.articulos,
        valorDormidoCentavos: valuacion.valorDormidoCentavos.toString(),
        umbralDias: entrada.umbralDias,
      };
    },
  },
);
