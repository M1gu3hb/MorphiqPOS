import 'server-only';

import { ErrorDominio, PAQUETES_RESTAURANTE } from '@morphiqpos/contracts';
import { repoStock, repoVentaCatalogo, type Transaccion } from '@morphiqpos/data';
import { porCantidad } from '@morphiqpos/domain/dinero';
import {
  calcularConsumo,
  type LineaParaConsumo,
  type MovimientoPlaneado,
} from '@morphiqpos/domain/inventario';
import { z } from 'zod';

import { definirComando } from '../definicion.ts';

/**
 * `inventario.consumo_interno` — F-261.
 *
 * ── Lo que hoy ensucia dos números a la vez ────────────────────────────────
 * La comida del personal y las cortesías al cliente frecuente salen del
 * inventario todos los días. Hoy o se registran como MERMA —y ensucian el
 * número con el que se persigue el desperdicio— o no se registran —y aparecen
 * como faltante en la toma física, que es el número con el que se persigue el
 * robo—. Las dos salidas acusan a alguien de algo que no hizo.
 *
 * ── Sale del stock, NO entra a ventas ──────────────────────────────────────
 * Es la regla entera. No hay ruta por la que un consumo interno se convierta en
 * venta: no toca `ordenes`, no toma folio, no pasa por caja y no suma al
 * costo de ventas. Lo que descuenta es lo mismo que descontaría el cobro —la
 * misma receta, el mismo `calcularConsumo`— porque el plato que se come el
 * cocinero lleva los mismos ingredientes.
 *
 * ── El costo lo calcula el servidor ────────────────────────────────────────
 * De la receta y del costo de cada insumo, dentro de esta transacción. Un costo
 * que llegara del navegador convertiría este registro en un número que elige
 * quien se come el plato.
 */

export const TIPOS_DE_CONSUMO = ['personal', 'cortesia', 'reposicion', 'degustacion'] as const;

export const entradaConsumoInterno = z.object({
  tipo: z.enum(TIPOS_DE_CONSUMO),
  productoId: z.uuid(),
  /** Texto, no número: `numeric(14,4)` son diezmilésimas y 0.1 + 0.2 no es 0.3. */
  cantidad: z.string().regex(/^\d+(\.\d{1,4})?$/, 'La cantidad va con hasta cuatro decimales.'),
  motivo: z.string().trim().min(3).max(200),
  /** Sólo en cortesía y reposición: es el platillo de una cuenta concreta. */
  ordenId: z.uuid().optional(),
});

export interface ResultadoConsumoInterno {
  readonly consumoId: string;
  readonly productoNombre: string;
  readonly costoCentavos: string;
  readonly insumosDescontados: number;
}

/**
 * Lo autoriza quien responde por el inventario, no quien se lo come.
 *
 * El mesero y el cocinero quedan fuera a propósito: si cualquiera pudiera
 * registrar su propia comida, esta tabla sería el camino cómodo para que salga
 * producto sin que nadie responda — que es exactamente lo que hoy pasa cuando
 * no se registra.
 */
const ROLES = ['gerente', 'administrador', 'dueno'] as const;

export const registrarConsumoInterno = definirComando<
  Transaccion,
  typeof entradaConsumoInterno,
  ResultadoConsumoInterno
>({
  nombre: 'inventario.consumo_interno',
  entidad: 'consumo_interno',
  escribe: true,
  roles: [...ROLES],
  paquetes: PAQUETES_RESTAURANTE,
  entrada: entradaConsumoInterno,
  async ejecutar(ctx, entrada) {
    const { organizacionId, sucursalId, empleoId } = ctx.ambito;

    if (sucursalId === null) {
      throw new ErrorDominio(
        'VENTA_SIN_TERMINAL',
        'Un consumo sale de un almacén, y el almacén es de una sucursal.',
      );
    }

    if (
      entrada.ordenId !== undefined &&
      entrada.tipo !== 'cortesia' &&
      entrada.tipo !== 'reposicion'
    ) {
      // La comida del personal no cuelga de una cuenta. Aceptar el vínculo
      // dejaría un consumo interno apuntando a una venta que no lo pagó, y el
      // reporte no podría distinguir «se lo comió el cocinero» de «se lo
      // regalamos a la mesa 4».
      throw new ErrorDominio(
        'INVENTARIO_INVALIDO',
        'Sólo una cortesía o una reposición pertenecen a una cuenta.',
        { tipo: entrada.tipo },
      );
    }

    const almacenId = await ctx.paso('almacen', () =>
      repoVentaCatalogo.almacenPrincipal(ctx.tx, organizacionId, sucursalId),
    );
    if (almacenId === null) {
      throw new ErrorDominio(
        'INVENTARIO_INVALIDO',
        'Esta sucursal no tiene almacén: no hay de dónde descontar.',
      );
    }

    const producto = await ctx.paso('cargar_producto', () =>
      repoVentaCatalogo.productoParaVender(ctx.tx, organizacionId, entrada.productoId),
    );
    if (producto === null) {
      throw new ErrorDominio('PRODUCTO_NO_ENCONTRADO', 'Ese producto no está en este catálogo.');
    }

    const recetas = await ctx.paso('cargar_receta', () =>
      repoVentaCatalogo.recetasDeProductos(ctx.tx, organizacionId, [producto.id]),
    );

    const lineas = planearConsumoInterno(
      { organizacionId, almacenId, empleadoId: empleoId, cantidad: entrada.cantidad },
      producto,
      recetas.get(producto.id) ?? [],
    );

    const movimientos = calcularConsumo(lineas);

    const consumo = await ctx.paso('anotar_consumo', () =>
      ctx.tx
        .insertInto('consumos_internos')
        .values({
          organizacion_id: organizacionId,
          sucursal_id: sucursalId,
          almacen_id: almacenId,
          tipo: entrada.tipo,
          orden_id: entrada.ordenId ?? null,
          producto_id: producto.id,
          producto_nombre: producto.nombre,
          cantidad: entrada.cantidad,
          unidad: producto.unidadVenta,
          costo_centavos: 0n,
          motivo: entrada.motivo,
          empleado_id: empleoId,
          created_at: ctx.ahora,
        })
        .returning('id')
        .executeTakeFirstOrThrow(),
    );

    let costoCentavos = 0n;

    if (movimientos.length > 0) {
      const insumoIds = [...new Set(movimientos.map((m) => m.insumoId))];
      const costos = await ctx.paso('costos_de_insumo', () =>
        ctx.tx
          .selectFrom('insumos')
          .select(['id', 'costo_unitario_centavos as costo'])
          .where('organizacion_id', '=', organizacionId)
          .where('id', 'in', insumoIds)
          .execute(),
      );
      const porInsumo = new Map(costos.map((c) => [c.id, c.costo]));

      for (const movimiento of movimientos) {
        costoCentavos += porCantidad(porInsumo.get(movimiento.insumoId) ?? 0n, movimiento.cantidad);
      }

      await ctx.paso('descontar_stock', () =>
        repoStock.aplicarMovimientos(comoConsumoInterno(movimientos, consumo.id, empleoId), ctx.tx),
      );
    }

    await ctx.paso('fijar_costo', () =>
      ctx.tx
        .updateTable('consumos_internos')
        .set({ costo_centavos: costoCentavos })
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', consumo.id)
        .execute(),
    );

    ctx.auditar({
      entidadId: consumo.id,
      payload: {
        tipo: entrada.tipo,
        producto: producto.nombre,
        cantidad: entrada.cantidad,
        costoCentavos: costoCentavos.toString(),
        insumos: movimientos.length,
        motivo: entrada.motivo,
      },
    });

    return {
      consumoId: consumo.id,
      productoNombre: producto.nombre,
      costoCentavos: costoCentavos.toString(),
      insumosDescontados: movimientos.length,
    };
  },
});

/**
 * Reetiqueta los movimientos como consumo interno.
 *
 * `calcularConsumo` los produce como salida de VENTA con referencia a una
 * orden, porque es el caso para el que nació. Aquí se corrigen las cuatro cosas
 * que los distinguen, y vive como función aparte —y no en línea— porque es lo
 * único de este comando que la base falsa no puede observar: `aplicarMovimientos`
 * escribe el ledger con SQL crudo. Comprobarlo aquí es la diferencia entre una
 * prueba y una suposición.
 */
export function comoConsumoInterno(
  movimientos: readonly MovimientoPlaneado[],
  consumoId: string,
  empleoId: string,
): MovimientoPlaneado[] {
  return movimientos.map((m) => ({
    ...m,
    // NO es una salida de venta: si lo fuera, el costo de ventas incluiría lo
    // que nadie pagó, que es exactamente lo que F-261 viene a separar.
    tipo: 'salida_consumo_interno' as const,
    referenciaTipo: 'consumo_interno' as const,
    referenciaId: consumoId,
    idempotencyKey: `consumo_interno:${consumoId}:${m.insumoId}`,
    empleadoId: empleoId,
  }));
}

export interface Contexto {
  readonly organizacionId: string;
  readonly almacenId: string;
  readonly empleadoId: string;
  readonly cantidad: string;
}

/**
 * Traduce el producto a líneas de consumo, con la MISMA tabla de estrategias
 * que usa el cobro.
 *
 * `ordenId` y `lineaId` llevan el id del consumo porque `calcularConsumo` los
 * exige para agrupar y para la clave de idempotencia; el movimiento resultante
 * se reetiqueta arriba a `consumo_interno`, que es lo que de verdad es.
 *
 * Un producto sin insumo ni receta —un servicio— no descuenta nada, igual que
 * al cobrar: lo que no se puede traducir se OMITE en vez de inventarle un
 * insumo. Descontar del almacén equivocado es peor que no descontar.
 */
export function planearConsumoInterno(
  contexto: Contexto,
  producto: repoVentaCatalogo.ProductoParaVender,
  receta: readonly {
    readonly insumoId: string;
    readonly cantidad: string;
    readonly unidad: string;
    readonly unidadBase: string;
    readonly mermaBp: number;
  }[],
): LineaParaConsumo[] {
  const comun = {
    organizacionId: contexto.organizacionId,
    almacenId: contexto.almacenId,
    // El consumo interno no tiene orden ni línea: se identifica a sí mismo.
    ordenId: 'consumo-interno',
    lineaId: 'consumo-interno',
    empleadoId: contexto.empleadoId,
    cantidad: contexto.cantidad,
    // Un consumo interno NO puede dejar el almacén en negativo: si no hay, no
    // se comió. Al cobrar sí se permite, porque el cliente ya se llevó el plato.
    permiteVentaSinStock: false,
  };

  if (producto.estrategiaConsumo === 'sku') {
    if (producto.insumoId === null || producto.unidadBaseInsumo === null) return [];
    return [
      {
        ...comun,
        estrategiaConsumo: 'sku',
        insumoId: producto.insumoId,
        unidadVenta: producto.unidadVenta,
        unidadBase: producto.unidadBaseInsumo,
      },
    ];
  }

  if (producto.estrategiaConsumo === 'receta') {
    if (receta.length === 0) return [];
    return [
      {
        ...comun,
        estrategiaConsumo: 'receta',
        receta: receta.map((i) => ({
          insumoId: i.insumoId,
          cantidad: i.cantidad,
          unidad: i.unidad,
          unidadBase: i.unidadBase,
          // La base guarda la merma en PUNTOS BASE (500 = 5 %) y el dominio la
          // espera en por ciento. Confundirlas descontaría cien veces más.
          mermaPorcentaje: (i.mermaBp / 100).toString(),
        })),
      },
    ];
  }

  return [];
}
