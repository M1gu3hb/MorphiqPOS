import 'server-only';

import { ErrorDominio, PAQUETES_MOSTRADOR } from '@morphiqpos/contracts';
import { calcularConsumo, type LineaParaConsumo } from '@morphiqpos/domain/inventario';
import type { Transaccion } from '@morphiqpos/data';
import { repoCaja, repoFolios, repoOrdenes, repoStock, repoVentaCatalogo } from '@morphiqpos/data';

import { definirComando } from '../definicion.ts';
import { cotizar, exigirTotalVigente } from './cotizar.ts';
import { entradaCobrarOrden } from './esquemas.ts';
import { repartirPagos } from './pagos.ts';

/**
 * `cobrarOrden` — la tarea más importante del corte (F1.1-A-09).
 *
 * UNA transacción escribe los ocho efectos: totales de la orden, estado, folio,
 * pagos, movimiento de caja, movimientos de stock, existencias y auditoría.
 * O confirma todo, o no persiste nada (R10).
 *
 * El orden de los pasos no es arbitrario. El stock se descuenta ANTES de tomar
 * el folio: si no hay inventario, la transacción se revierte y el consecutivo
 * vuelve atrás con ella, sin dejar hueco en la numeración. Al revés, cada venta
 * fallida se comería un folio y el SAT vería saltos que nadie sabe explicar.
 *
 * El descuento de stock lo hace `aplicarMovimientos` del carril B, con la
 * guarda en el `WHERE` y el ledger inmutable. Aquí se llama, no se reimplementa.
 */

export interface ResultadoCobro {
  readonly ordenId: string;
  readonly serie: string;
  readonly folio: string;
  readonly totalCentavos: string;
  readonly pagadoCentavos: string;
  readonly cambioCentavos: string;
}

export const cobrarOrden = definirComando<Transaccion, typeof entradaCobrarOrden, ResultadoCobro>({
  nombre: 'venta.cobrar',
  entidad: 'orden',
  escribe: true,
  roles: ['cajero', 'gerente', 'administrador', 'dueno'],
  paquetes: PAQUETES_MOSTRADOR,
  entrada: entradaCobrarOrden,
  async ejecutar(ctx, entrada) {
    const { organizacionId, sucursalId, terminalId, empleoId } = ctx.ambito;
    if (sucursalId === null || terminalId === null) {
      throw new ErrorDominio(
        'VENTA_SIN_TERMINAL',
        'Para cobrar hace falta una terminal dada de alta en una sucursal.',
      );
    }

    // 1 · La orden, y que siga siendo cobrable.
    const orden = await ctx.paso('cargar_orden', () =>
      repoOrdenes.ordenPorId(ctx.tx, organizacionId, entrada.ordenId),
    );
    if (orden === null) throw new ErrorDominio('ORDEN_NO_ENCONTRADA', 'Esa venta ya no existe.');
    if (orden.estado !== 'borrador') {
      throw new ErrorDominio('ORDEN_NO_EDITABLE', 'Esa venta ya se cobró.', {
        estado: orden.estado,
      });
    }

    // 2 · El total se recalcula DENTRO de esta transacción, sobre las líneas
    //     que se están congelando. Nunca se usa un importe del cliente (P0-07).
    const { cotizacion, totales } = await ctx.paso('cotizar', () =>
      cotizar(ctx.tx, organizacionId, entrada.ordenId),
    );
    if (cotizacion.lineas.length === 0) {
      throw new ErrorDominio('ORDEN_VACIA', 'No se puede cobrar una venta sin productos.');
    }
    exigirTotalVigente(totales.totalCentavos, entrada.totalEsperadoCentavos);

    // 3 · Los pagos tienen que sumar exactamente el total. Un pago mixto son
    //     varias filas en `pagos` (corrige P1-11).
    const pagos = repartirPagos(entrada.pagos, totales.totalCentavos);

    // 4 · La caja tiene que estar abierta: sin sesión, el efectivo no tiene
    //     dónde registrarse y el arqueo del día nace incompleto.
    const sesion = await ctx.paso('cargar_caja', () =>
      repoCaja.sesionAbiertaDeTerminal(ctx.tx, organizacionId, terminalId),
    );
    if (sesion === null) {
      throw new ErrorDominio('CAJA_CERRADA', 'Abre la caja antes de cobrar.');
    }

    // 5 · Stock ANTES del folio: si falta inventario, la reversión no deja
    //     hueco en la numeración.
    const movimientos = await planearConsumo(ctx.tx, organizacionId, sucursalId, entrada.ordenId);
    if (movimientos.length > 0) {
      await ctx.paso('descontar_stock', () =>
        repoStock.aplicarMovimientos(
          movimientos.map((m) => ({ ...m, empleadoId: empleoId })),
          ctx.tx,
        ),
      );
    }

    // 6 · Folio atómico con UPDATE … RETURNING (F1.1-A-05).
    const folio = await ctx.paso('tomar_folio', () =>
      repoFolios.tomarFolio(ctx.tx, organizacionId, sucursalId),
    );

    // 7 · Pagos y movimiento de caja.
    let efectivo = 0n;
    for (const pago of pagos) {
      await repoOrdenes.registrarPago(ctx.tx, {
        organizacionId,
        ordenId: entrada.ordenId,
        sesionCajaId: sesion.id,
        metodo: pago.metodo,
        montoCentavos: pago.montoCentavos,
        recibidoCentavos: pago.recibidoCentavos,
        cambioCentavos: pago.cambioCentavos,
        referencia: pago.referencia,
        idempotencyKey: null,
      });
      if (pago.metodo === 'efectivo') efectivo += pago.montoCentavos;
    }

    if (efectivo > 0n) {
      await repoCaja.registrarMovimiento(ctx.tx, {
        organizacionId,
        sesionCajaId: sesion.id,
        tipo: 'venta',
        montoCentavos: efectivo,
        referenciaTipo: 'orden',
        referenciaId: entrada.ordenId,
        empleadoId: empleoId,
        motivo: null,
      });
    }

    // 8 · Congelar la orden con sus totales y su folio.
    await ctx.paso('cerrar_orden', () =>
      repoOrdenes.marcarPagada(ctx.tx, {
        organizacionId,
        ordenId: entrada.ordenId,
        sesionCajaId: sesion.id,
        empleadoCobraId: empleoId,
        serie: folio.serie,
        folio: folio.folio,
        totales,
      }),
    );

    const cambio = pagos.reduce((suma, p) => suma + p.cambioCentavos, 0n);

    ctx.auditar({
      entidadId: entrada.ordenId,
      payload: {
        folio: `${folio.serie}-${folio.folio.toString()}`,
        totalCentavos: totales.totalCentavos.toString(),
        metodos: pagos.map((p) => p.metodo),
        lineas: cotizacion.lineas.length,
        movimientosStock: movimientos.length,
      },
    });

    return {
      ordenId: entrada.ordenId,
      serie: folio.serie,
      folio: folio.folio.toString(),
      totalCentavos: totales.totalCentavos.toString(),
      pagadoCentavos: pagos.reduce((s, p) => s + p.montoCentavos, 0n).toString(),
      cambioCentavos: cambio.toString(),
    };
  },
});

/**
 * Traduce las líneas de la orden al contrato de consumo del carril B.
 *
 * Sólo entran los productos con estrategia `sku`: recetas llegan en F1.3, y un
 * servicio no descuenta nada. Lo que no se puede traducir se omite en vez de
 * inventarle un insumo — descontar del almacén equivocado es peor que no
 * descontar.
 */
async function planearConsumo(
  tx: Transaccion,
  organizacionId: string,
  sucursalId: string,
  ordenId: string,
): Promise<ReturnType<typeof calcularConsumo>> {
  const almacenId = await repoVentaCatalogo.almacenPrincipal(tx, organizacionId, sucursalId);
  if (almacenId === null) return [];

  const lineas = await repoOrdenes.lineasDeOrden(tx, organizacionId, ordenId);
  const paraConsumo: LineaParaConsumo[] = [];

  for (const linea of lineas) {
    if (linea.productoId === null) continue;
    const producto = await repoVentaCatalogo.productoParaVender(
      tx,
      organizacionId,
      linea.productoId,
    );
    if (producto === null) continue;
    if (producto.estrategiaConsumo !== 'sku') continue;
    if (producto.insumoId === null || producto.unidadBaseInsumo === null) continue;

    paraConsumo.push({
      organizacionId,
      almacenId,
      ordenId,
      lineaId: linea.id,
      cantidad: linea.cantidad,
      permiteVentaSinStock: producto.permiteVentaSinStock,
      estrategiaConsumo: 'sku',
      insumoId: producto.insumoId,
      unidadVenta: linea.unidad,
      unidadBase: producto.unidadBaseInsumo,
    });
  }

  return calcularConsumo(paraConsumo);
}
