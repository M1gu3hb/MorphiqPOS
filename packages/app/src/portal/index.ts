/**
 * Portal QR público — E7-1 y E7-3.
 *
 * Todo lo que se sirve por aquí lo lee un DESCONOCIDO: quien escanea un código
 * pegado a una mesa no ha iniciado sesión y nunca la va a iniciar. Por eso las
 * dos piezas que gobiernan el módulo son la lista blanca (`lista-blanca.ts`,
 * que cierra D-14) y el ámbito que nace del token de la mesa (`ambito.ts`).
 */

export { servirPortal, manejadorPublico, type RespuestaDelPortal } from './http.ts';

export { payloadDelPortal, type PayloadPortal } from './consulta.ts';

export { abrirMesaDesdeQR, type ResultadoAbrirMesa } from './mesa.ts';
export { enviarPedidoDesdeQR, type ResultadoPedido } from './pedido.ts';
export { crearSolicitudQR, type ResultadoSolicitud } from './solicitudes.ts';
export { pedirCuentaQR, type ResultadoCuenta } from './cuenta.ts';
export { valorarVisita, type ResultadoValoracion } from './valoracion.ts';

export {
  resolverAmbitoPortal,
  tokenConFormaValida,
  type AmbitoPortal,
  type BuscadorDeMesa,
  type FilaMesaPorToken,
} from './ambito.ts';

export {
  categoriaDeMenu,
  negocioPublico,
  productoDeMenu,
  seccionDeMenu,
  type NegocioPublico,
  type ProductoDeMenu,
} from './lista-blanca.ts';

export { cuentaPublica, type CuentaPublica, type MesaPublica } from './cuenta-publica.ts';

export { banderasDe, porcentajesValidos, type BanderasPortal } from './banderas.ts';
export { LIMITES_PORTAL, permitirPortal, type AccionPortal } from './limite.ts';
export { puedeOrdenarDesdeQR } from './negocio.ts';
