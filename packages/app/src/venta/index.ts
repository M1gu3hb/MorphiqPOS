import 'server-only';

/** Los comandos de venta (F1.1-A-06, A-07, A-09, A-12). */

export { agregarLinea, cambiarCantidad, crearOrden, quitarLinea, vaciarOrden } from './carrito.ts';
export {
  entradaMasVendidos,
  masVendidos,
  type ProductoMasVendido,
  type ResultadoMasVendidos,
} from './mas-vendidos.ts';

export {
  devolverPedido,
  entradaDevolverPedido,
  type DineroPorMetodo,
  type ResultadoDevolucion,
} from './devolucion.ts';
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

export {
  autorizarDescuento,
  entradaAutorizarDescuento,
  type ResultadoAutorizacion,
} from './descuento.ts';

export {
  entradaRetomar,
  entradaSuspender,
  entradaSuspendidas,
  retomarVenta,
  suspenderVenta,
  ventasEnEspera,
  type ResultadoEnEspera,
  type ResultadoRetomada,
  type ResultadoSuspension,
  type VentaEnEspera,
} from './suspender.ts';
