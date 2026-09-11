import 'server-only';

import { ErrorDominio } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { repoOrdenes, repoVentaCatalogo } from '@morphiqpos/data';

import { definirComando } from '../definicion.ts';
import {
  entradaAgregarLinea,
  entradaCambiarCantidad,
  entradaCrearOrden,
  entradaQuitarLinea,
} from './esquemas.ts';
import { valorarLinea } from './valorar.ts';

/**
 * El carrito ES la orden en borrador (F1.1-A-06).
 *
 * Corrige P1-10. En la fuente el carrito vivía en el navegador y se convertía
 * en venta al cobrar: un fallo a media venta obligaba a rehacerla de memoria, y
 * el reintento duplicaba. Aquí cada línea se persiste al agregarse, así que
 * cerrar la pestaña y volver recupera exactamente lo que había.
 *
 * El índice parcial `ordenes_borrador_por_terminal` garantiza **un solo
 * borrador por terminal**: si hubiera dos, el cajero vería uno y cobraría el
 * otro.
 */

const ROLES_DE_VENTA = ['cajero', 'mesero', 'gerente', 'administrador', 'dueno'] as const;
const TODOS_LOS_PAQUETES = [
  'tienda',
  'ferreteria',
  'farmacia',
  'cafeteria',
  'restaurante',
] as const;

/** Abre el carrito de esta terminal, o devuelve el que ya estaba abierto. */
export const crearOrden = definirComando<
  Transaccion,
  typeof entradaCrearOrden,
  { ordenId: string }
>({
  nombre: 'venta.crear_orden',
  entidad: 'orden',
  escribe: true,
  roles: [...ROLES_DE_VENTA],
  paquetes: [...TODOS_LOS_PAQUETES],
  entrada: entradaCrearOrden,
  async ejecutar(ctx) {
    const { organizacionId, sucursalId, terminalId, empleoId } = ctx.ambito;
    if (sucursalId === null || terminalId === null) {
      throw new ErrorDominio(
        'VENTA_SIN_TERMINAL',
        'Para vender hace falta una terminal dada de alta en una sucursal.',
      );
    }

    // Idempotencia natural: si ya hay borrador, se devuelve ese. Sin esto,
    // recargar la pantalla chocaría contra el índice parcial único.
    const existente = await ctx.paso('buscar_borrador', () =>
      repoOrdenes.borradorDeTerminal(ctx.tx, organizacionId, terminalId),
    );
    if (existente !== null) {
      ctx.auditar({ entidadId: existente.id, payload: { reutilizada: true } });
      return { ordenId: existente.id };
    }

    const ordenId = await ctx.paso('crear_borrador', () =>
      repoOrdenes.crearBorrador(ctx.tx, {
        organizacionId,
        sucursalId,
        terminalId,
        empleadoAtiendeId: empleoId,
        sesionCajaId: null,
      }),
    );

    ctx.auditar({ entidadId: ordenId, payload: { reutilizada: false } });
    return { ordenId };
  },
});

export const agregarLinea = definirComando<
  Transaccion,
  typeof entradaAgregarLinea,
  { lineaId: string; subtotalCentavos: string }
>({
  nombre: 'venta.agregar_linea',
  entidad: 'orden',
  escribe: true,
  roles: [...ROLES_DE_VENTA],
  paquetes: [...TODOS_LOS_PAQUETES],
  entrada: entradaAgregarLinea,
  async ejecutar(ctx, entrada) {
    const { organizacionId } = ctx.ambito;

    const orden = await exigirBorrador(ctx.tx, organizacionId, entrada.ordenId);

    const producto = await ctx.paso('cargar_producto', () =>
      repoVentaCatalogo.productoParaVender(ctx.tx, organizacionId, entrada.productoId),
    );
    // Un producto de otra organización responde igual que uno inexistente:
    // distinguirlos permitiría sondear el catálogo ajeno con ids (TEN-01).
    if (producto === null) {
      throw new ErrorDominio('PRODUCTO_NO_ENCONTRADO', 'Ese producto no está disponible.');
    }

    const valorada = valorarLinea(producto, entrada.cantidad, entrada.unidad);
    const visual = await repoOrdenes.siguienteOrdenVisual(ctx.tx, organizacionId, orden.id);

    const lineaId = await ctx.paso('insertar_linea', () =>
      repoOrdenes.agregarLinea(ctx.tx, {
        organizacionId,
        ordenId: orden.id,
        productoId: producto.id,
        productoNombre: producto.nombre,
        sku: producto.sku,
        codigoBarras: producto.codigoBarras,
        cantidad: valorada.cantidad,
        unidad: valorada.unidad,
        precioUnitarioCentavos: valorada.precio.precioUnitarioCentavos,
        costoUnitarioCentavos: producto.costoUnitarioCentavos,
        subtotalCentavos: valorada.precio.subtotalCentavos,
        totalCentavos: valorada.precio.subtotalCentavos,
        esMayoreo: valorada.precio.esMayoreo,
        tipoVenta: producto.tipoVenta,
        ordenVisual: visual,
      }),
    );

    ctx.auditar({
      entidadId: orden.id,
      payload: { lineaId, productoId: producto.id, cantidad: valorada.cantidad },
    });

    return {
      lineaId,
      subtotalCentavos: valorada.precio.subtotalCentavos.toString(),
    };
  },
});

export const quitarLinea = definirComando<
  Transaccion,
  typeof entradaQuitarLinea,
  { quitada: true }
>({
  nombre: 'venta.quitar_linea',
  entidad: 'orden',
  escribe: true,
  roles: [...ROLES_DE_VENTA],
  paquetes: [...TODOS_LOS_PAQUETES],
  entrada: entradaQuitarLinea,
  async ejecutar(ctx, entrada) {
    const { organizacionId } = ctx.ambito;
    await exigirBorrador(ctx.tx, organizacionId, entrada.ordenId);

    const borradas = await ctx.paso('quitar_linea', () =>
      repoOrdenes.quitarLinea(ctx.tx, organizacionId, entrada.ordenId, entrada.lineaId),
    );
    // Cero filas = la línea no era de esta orden ni de esta organización.
    if (borradas === 0) {
      throw new ErrorDominio('LINEA_NO_ENCONTRADA', 'Esa línea ya no está en la venta.');
    }

    ctx.auditar({ entidadId: entrada.ordenId, payload: { lineaId: entrada.lineaId } });
    return { quitada: true as const };
  },
});

export const cambiarCantidad = definirComando<
  Transaccion,
  typeof entradaCambiarCantidad,
  { subtotalCentavos: string }
>({
  nombre: 'venta.cambiar_cantidad',
  entidad: 'orden',
  escribe: true,
  roles: [...ROLES_DE_VENTA],
  paquetes: [...TODOS_LOS_PAQUETES],
  entrada: entradaCambiarCantidad,
  async ejecutar(ctx, entrada) {
    const { organizacionId } = ctx.ambito;
    await exigirBorrador(ctx.tx, organizacionId, entrada.ordenId);

    const lineas = await repoOrdenes.lineasDeOrden(ctx.tx, organizacionId, entrada.ordenId);
    const linea = lineas.find((l) => l.id === entrada.lineaId);
    const productoId = linea?.productoId ?? null;
    if (linea === undefined || productoId === null) {
      throw new ErrorDominio('LINEA_NO_ENCONTRADA', 'Esa línea ya no está en la venta.');
    }

    // Se revalúa desde el catálogo, no se reescala el subtotal guardado: el
    // mayoreo cambia el precio unitario al cruzar su mínimo, y multiplicar el
    // subtotal viejo por la razón de cantidades se saltaría ese salto.
    const producto = await ctx.paso('cargar_producto', () =>
      repoVentaCatalogo.productoParaVender(ctx.tx, organizacionId, productoId),
    );
    if (producto === null) {
      throw new ErrorDominio('PRODUCTO_NO_ENCONTRADO', 'Ese producto ya no está disponible.');
    }

    const valorada = valorarLinea(producto, entrada.cantidad, linea.unidad);

    await ctx.paso('actualizar_linea', () =>
      repoOrdenes.actualizarImportesDeLinea(ctx.tx, organizacionId, entrada.lineaId, {
        cantidad: valorada.cantidad,
        subtotalCentavos: valorada.precio.subtotalCentavos,
        totalCentavos: valorada.precio.subtotalCentavos,
        precioUnitarioCentavos: valorada.precio.precioUnitarioCentavos,
        esMayoreo: valorada.precio.esMayoreo,
      }),
    );

    ctx.auditar({
      entidadId: entrada.ordenId,
      payload: { lineaId: entrada.lineaId, cantidad: valorada.cantidad },
    });

    return { subtotalCentavos: valorada.precio.subtotalCentavos.toString() };
  },
});

/** Carga la orden y exige que siga siendo un borrador. */
async function exigirBorrador(
  tx: Transaccion,
  organizacionId: string,
  ordenId: string,
): Promise<repoOrdenes.OrdenBorrador> {
  const orden = await repoOrdenes.ordenPorId(tx, organizacionId, ordenId);
  if (orden === null) {
    throw new ErrorDominio('ORDEN_NO_ENCONTRADA', 'Esa venta ya no existe.');
  }
  // R14: los estados cambian por transición declarada. Tocar las líneas de una
  // orden ya cobrada alteraría un ticket impreso y un arqueo cerrado.
  if (orden.estado !== 'borrador') {
    throw new ErrorDominio(
      'ORDEN_NO_EDITABLE',
      'Esa venta ya se cobró o se canceló; no se puede modificar.',
      { estado: orden.estado },
    );
  }
  return orden;
}
