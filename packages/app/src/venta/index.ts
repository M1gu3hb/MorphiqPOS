import 'server-only';

/** Los comandos de venta (F1.1-A-06, A-07, A-09, A-12). */

export { agregarLinea, cambiarCantidad, crearOrden, quitarLinea } from './carrito.ts';
export {
  buscarCatalogo,
  estadoDeVenta,
  ticketDeOrden,
  type EstadoVenta,
  type ProductoEnRejilla,
  type TicketImpreso,
} from './consultas.ts';
export { cobrarOrden, type ResultadoCobro } from './cobrar.ts';
export { repartirPagos, type PagoEntrante, type PagoValidado } from './pagos.ts';
export { cotizar, IMPUESTO_POR_OMISION, type Cotizacion, type LineaCotizada } from './cotizar.ts';
