import 'server-only';

import { ErrorDominio, PAQUETES_MOSTRADOR } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { repoOrdenes, repoCaja, repoVentaCatalogo } from '@morphiqpos/data';

import { definirComando } from '../definicion.ts';
import { cotizar, type Cotizacion } from './cotizar.ts';
import { entradaBuscarCatalogo, entradaEstadoVenta, entradaTicket } from './esquemas.ts';

/**
 * Las lecturas de la pantalla de venta (F1.1-A-07 y A-12).
 *
 * Van por el mismo envoltorio que las escrituras y no por un `fetch` suelto,
 * porque el ámbito y el rol se comprueban igual: leer el catálogo de otra
 * organización es una fuga, aunque no cambie nada.
 */

const ROLES_DE_MOSTRADOR = ['cajero', 'mesero', 'gerente', 'administrador', 'dueno'] as const;
export interface EstadoVenta {
  readonly cotizacion: Cotizacion | null;
  /** `null` = no hay caja abierta en esta terminal; la pantalla lo dice antes de cobrar. */
  readonly sesionCajaId: string | null;
}

/**
 * El estado completo de la venta en curso.
 *
 * Sin `ordenId` devuelve el borrador vivo de la terminal, que es lo que hace
 * que recargar la pestaña recupere el carrito en vez de perderlo (P1-10).
 */
export const estadoDeVenta = definirComando<Transaccion, typeof entradaEstadoVenta, EstadoVenta>({
  nombre: 'venta.estado',
  entidad: 'orden',
  escribe: false,
  roles: [...ROLES_DE_MOSTRADOR],
  paquetes: PAQUETES_MOSTRADOR,
  entrada: entradaEstadoVenta,
  async ejecutar(ctx, entrada) {
    const { organizacionId, terminalId } = ctx.ambito;

    const caja =
      terminalId === null
        ? null
        : await repoCaja.sesionAbiertaDeTerminal(ctx.tx, organizacionId, terminalId);

    const ordenId = await resolverOrden(ctx.tx, organizacionId, terminalId, entrada.ordenId);
    if (ordenId === null) {
      return { cotizacion: null, sesionCajaId: caja?.id ?? null };
    }

    const { cotizacion } = await ctx.paso('cotizar', () =>
      cotizar(ctx.tx, organizacionId, ordenId),
    );
    return { cotizacion, sesionCajaId: caja?.id ?? null };
  },
});

async function resolverOrden(
  tx: Transaccion,
  organizacionId: string,
  terminalId: string | null,
  ordenId: string | undefined,
): Promise<string | null> {
  if (ordenId !== undefined) {
    const orden = await repoOrdenes.ordenPorId(tx, organizacionId, ordenId);
    if (orden === null) throw new ErrorDominio('ORDEN_NO_ENCONTRADA', 'Esa venta no existe.');
    return orden.id;
  }
  if (terminalId === null) return null;
  const borrador = await repoOrdenes.borradorDeTerminal(tx, organizacionId, terminalId);
  return borrador?.id ?? null;
}

export interface ProductoEnRejilla {
  readonly id: string;
  readonly nombre: string;
  readonly sku: string | null;
  readonly precioVentaCentavos: string;
  readonly tipoVenta: string;
  readonly unidadVenta: string;
  readonly categoriaNombre: string | null;
  readonly existencia: string | null;
}

export const buscarCatalogo = definirComando<
  Transaccion,
  typeof entradaBuscarCatalogo,
  { productos: readonly ProductoEnRejilla[] }
>({
  nombre: 'venta.buscar',
  entidad: 'producto',
  escribe: false,
  roles: [...ROLES_DE_MOSTRADOR],
  paquetes: PAQUETES_MOSTRADOR,
  entrada: entradaBuscarCatalogo,
  async ejecutar(ctx, entrada) {
    const { organizacionId, sucursalId } = ctx.ambito;

    const almacenId =
      sucursalId === null
        ? null
        : await repoVentaCatalogo.almacenPrincipal(ctx.tx, organizacionId, sucursalId);

    const filas = await ctx.paso('buscar', () =>
      repoVentaCatalogo.catalogoDeVenta(ctx.tx, organizacionId, {
        ...(entrada.busqueda === undefined ? {} : { busqueda: entrada.busqueda }),
        ...(almacenId === null ? {} : { almacenId }),
        limite: entrada.limite,
      }),
    );

    return {
      productos: filas.map((f) => ({
        id: f.id,
        nombre: f.nombre,
        sku: f.sku,
        precioVentaCentavos: f.precioVentaCentavos.toString(),
        tipoVenta: f.tipoVenta,
        unidadVenta: f.unidadVenta,
        categoriaNombre: f.categoriaNombre,
        existencia: f.existencia,
      })),
    };
  },
});

export interface TicketImpreso {
  readonly serie: string;
  readonly folio: string | null;
  readonly emitidoEn: string;
  readonly organizacionNombre: string;
  readonly sucursalNombre: string;
  readonly lineas: readonly {
    readonly nombre: string;
    readonly cantidad: string;
    readonly unidad: string;
    readonly precioUnitarioCentavos: string;
    readonly importeCentavos: string;
  }[];
  readonly subtotalCentavos: string;
  readonly descuentoCentavos: string;
  readonly impuestosCentavos: string;
  readonly totalCentavos: string;
  readonly pagos: readonly {
    readonly metodo: string;
    readonly montoCentavos: string;
    readonly recibidoCentavos: string | null;
    readonly cambioCentavos: string;
  }[];
}

/**
 * El ticket de una venta cobrada (F1.1-A-12).
 *
 * Devuelve los totales **congelados** de la orden, no un recálculo: reimprimir
 * un ticket con el precio de hoy no reproduce el documento que se le dio al
 * cliente. Por eso lee de `ordenes` y no vuelve a llamar a `cotizar`.
 */
export const ticketDeOrden = definirComando<Transaccion, typeof entradaTicket, TicketImpreso>({
  nombre: 'venta.ticket',
  entidad: 'orden',
  escribe: false,
  roles: [...ROLES_DE_MOSTRADOR],
  paquetes: PAQUETES_MOSTRADOR,
  entrada: entradaTicket,
  async ejecutar(ctx, entrada) {
    const { organizacionId } = ctx.ambito;

    const orden = await ctx.paso('cargar_orden', () =>
      repoOrdenes.ordenParaTicket(ctx.tx, organizacionId, entrada.ordenId),
    );
    if (orden === null) throw new ErrorDominio('ORDEN_NO_ENCONTRADA', 'Esa venta no existe.');

    const [lineas, pagos] = await Promise.all([
      repoOrdenes.lineasDeOrden(ctx.tx, organizacionId, entrada.ordenId),
      repoOrdenes.pagosDeOrden(ctx.tx, organizacionId, entrada.ordenId),
    ]);

    return {
      serie: orden.serie,
      folio: orden.folio === null ? null : orden.folio.toString(),
      emitidoEn: orden.createdAt.toISOString(),
      organizacionNombre: orden.organizacionNombre,
      sucursalNombre: orden.sucursalNombre,
      lineas: lineas.map((l) => ({
        nombre: l.productoNombre,
        cantidad: l.cantidad,
        unidad: l.unidad,
        precioUnitarioCentavos: l.precioUnitarioCentavos.toString(),
        importeCentavos: l.subtotalCentavos.toString(),
      })),
      subtotalCentavos: orden.subtotalCentavos.toString(),
      descuentoCentavos: orden.descuentoCentavos.toString(),
      impuestosCentavos: orden.impuestosCentavos.toString(),
      totalCentavos: orden.totalCentavos.toString(),
      pagos: pagos.map((p) => ({
        metodo: p.metodo,
        montoCentavos: p.montoCentavos.toString(),
        recibidoCentavos: p.recibidoCentavos === null ? null : p.recibidoCentavos.toString(),
        cambioCentavos: p.cambioCentavos.toString(),
      })),
    };
  },
});
