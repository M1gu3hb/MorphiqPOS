import 'server-only';

import { ErrorDominio, PAQUETES_OPERATIVOS } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { sql } from 'kysely';
import { z } from 'zod';

import { definirComando, type ContextoComando } from '../definicion.ts';

/**
 * `venta.registrar_servicio` — F-258.
 *
 * ── Lo que hoy se cobra «aparte» ─────────────────────────────────────────
 * Copia de llave, entonado de pintura, corte de vidrio y de madera, cuerda a
 * tubo. Del 4 % al 8 % de la venta con márgenes del 60 % al 80 %, y hoy no está
 * en ningún reporte de ningún sistema del segmento: se cobra suelto, el material
 * sale del inventario sin renglón, y el margen del negocio se reporta más bajo
 * de lo que de verdad es.
 *
 * ── Por qué el material y la mano de obra van separados ──────────────────
 * Porque son dos cosas con dos márgenes. El material tiene el costo que tiene y
 * el ledger lo valúa; la mano de obra es margen casi puro. Sumarlos en un solo
 * importe escondería exactamente el dato que esta función viene a sacar a la
 * luz, y dejaría el servicio pareciendo un producto caro.
 *
 * ── Por qué este comando NO cobra ────────────────────────────────────────
 * El importe de la partida lo pone `venta.cobrar`. Aquí se declara qué se hizo y
 * qué material se fue; cobrar también aquí sería el segundo sitio donde se
 * calcula un importe.
 */

const ROLES = ['cajero', 'almacen', 'gerente', 'administrador', 'dueno'] as const;
const CANTIDAD = /^\d{1,10}(\.\d{1,4})?$/;

export const entradaRegistrarServicio = z.object({
  ordenLineaId: z.uuid(),
  almacenId: z.uuid(),
  tipo: z.enum(['copia_llave', 'entonado', 'corte_vidrio', 'corte_madera', 'cuerda_tubo', 'otro']),
  /** SÓLO la mano de obra. El material va por su lado, valuado por el ledger. */
  manoObraCentavos: z.number().int().min(0).max(10_000_000),
  /** Medidas del corte, fórmula del color, tipo de llave. */
  parametros: z.record(z.string().max(40), z.string().max(200)).default({}),
  consumos: z
    .array(
      z.object({
        productoId: z.uuid(),
        cantidadBase: z.string().regex(CANTIDAD, 'La cantidad va con hasta cuatro decimales.'),
      }),
    )
    .max(20)
    .default([]),
});

export interface ConsumoRegistrado {
  readonly productoId: string;
  readonly cantidadBase: string;
  readonly movimientoStockId: string;
}

export interface ResultadoServicio {
  readonly servicioId: string;
  readonly tipo: string;
  readonly manoObraCentavos: string;
  readonly consumos: readonly ConsumoRegistrado[];
}

export const registrarServicio = definirComando<
  Transaccion,
  typeof entradaRegistrarServicio,
  ResultadoServicio
>({
  nombre: 'venta.registrar_servicio',
  entidad: 'servicio_mostrador',
  escribe: true,
  roles: [...ROLES],
  paquetes: PAQUETES_OPERATIVOS,
  entrada: entradaRegistrarServicio,
  async ejecutar(ctx, entrada) {
    const { organizacionId, empleoId } = ctx.ambito;

    const yaHay = await ctx.paso('mirar_servicio', () =>
      ctx.tx
        .selectFrom('servicios_mostrador')
        .select(['id'])
        .where('orden_linea_id', '=', entrada.ordenLineaId)
        .executeTakeFirst(),
    );
    if (yaHay !== undefined) {
      // Dos servicios sobre la misma partida son dos manos de obra cobradas una
      // sola vez, y dos veces el material fuera del almacén.
      throw new ErrorDominio(
        'CONFIGURACION_CONFLICTO',
        'Esa partida ya tiene su servicio registrado.',
        { servicioId: yaHay.id },
      );
    }

    const registrados: ConsumoRegistrado[] = [];
    for (const consumo of entrada.consumos) {
      registrados.push(
        await sacarMaterial(ctx, entrada.almacenId, consumo, entrada.ordenLineaId, entrada.tipo),
      );
    }

    const servicio = await ctx.paso('anotar_servicio', () =>
      ctx.tx
        .insertInto('servicios_mostrador')
        .values({
          organizacion_id: organizacionId,
          orden_linea_id: entrada.ordenLineaId,
          tipo: entrada.tipo,
          mano_obra_centavos: BigInt(entrada.manoObraCentavos),
          parametros: JSON.stringify(entrada.parametros),
          // El índice de lo que se consumió. La fuente sigue siendo el ledger.
          consumos: JSON.stringify(registrados),
          empleado_id: empleoId,
          created_at: ctx.ahora,
        })
        .returning('id')
        .executeTakeFirstOrThrow(),
    );

    ctx.auditar({
      entidadId: servicio.id,
      payload: {
        ordenLineaId: entrada.ordenLineaId,
        tipo: entrada.tipo,
        manoObraCentavos: entrada.manoObraCentavos,
        consumos: registrados.length,
      },
    });

    return {
      servicioId: servicio.id,
      tipo: entrada.tipo,
      manoObraCentavos: entrada.manoObraCentavos.toString(),
      consumos: registrados,
    };
  },
});

/**
 * El material del servicio sale del almacén como cualquier otra salida.
 *
 * `consumo_servicio` y no `salida_venta`: no se vendió esa llave en bruto, se
 * usó para hacer una copia. Meterlo en `salida_venta` mezclaría el costo del
 * servicio con el costo de ventas de mostrador, y el margen de los dos dejaría
 * de poderse separar — que es justo lo que F-258 viene a resolver.
 */
async function sacarMaterial(
  ctx: ContextoComando<Transaccion>,
  almacenId: string,
  consumo: { readonly productoId: string; readonly cantidadBase: string },
  ordenLineaId: string,
  tipo: string,
): Promise<ConsumoRegistrado> {
  const producto = await ctx.paso('cargar_insumo', () =>
    ctx.tx
      .selectFrom('insumos')
      .select(['id', 'unidad_base as unidadBase'])
      .where('organizacion_id', '=', ctx.ambito.organizacionId)
      .where('producto_id', '=', consumo.productoId)
      .where('activo', '=', true)
      .executeTakeFirst(),
  );
  if (producto === undefined) {
    throw new ErrorDominio(
      'PUENTE_NO_ENCONTRADO',
      'Ese material no lleva existencia en este negocio.',
      { productoId: consumo.productoId },
    );
  }

  const resultado = await ctx.paso('descontar_material', () =>
    sql<{ cantidad: string }>`
      update existencias
         set cantidad = cantidad - ${consumo.cantidadBase}, actualizado_en = now()
       where organizacion_id = ${ctx.ambito.organizacionId}
         and almacen_id = ${almacenId}
         and insumo_id = ${producto.id}
         and cantidad >= ${consumo.cantidadBase}
      returning cantidad
    `.execute(ctx.tx),
  );
  if (resultado.rows.length !== 1) {
    throw new ErrorDominio('STOCK_INSUFICIENTE', 'No hay material suficiente para ese servicio.', {
      productoId: consumo.productoId,
    });
  }

  const movimiento = await ctx.paso('anotar_consumo', () =>
    ctx.tx
      .insertInto('movimientos_stock')
      .values({
        organizacion_id: ctx.ambito.organizacionId,
        almacen_id: almacenId,
        insumo_id: producto.id,
        tipo: 'consumo_servicio',
        cantidad: `-${consumo.cantidadBase}`,
        unidad: producto.unidadBase,
        referencia_tipo: 'servicio',
        referencia_id: ordenLineaId,
        empleado_id: ctx.ambito.empleoId,
        motivo: tipo,
      })
      .returning('id')
      .executeTakeFirstOrThrow(),
  );

  return {
    productoId: consumo.productoId,
    cantidadBase: consumo.cantidadBase,
    movimientoStockId: movimiento.id,
  };
}
