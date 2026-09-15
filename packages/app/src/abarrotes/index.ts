/**
 * `abarrotes` — la raíz del arquetipo A1 (retail de mostrador).
 *
 * Lo que vive aquí lo heredan `ferreteria` y, con matices, `farmacia`: las
 * presentaciones, el conteo por zonas y el dinero ajeno que pasa por el cajón.
 * El paquete que declaran es el que hoy tienen esos giros; el renombre a
 * `tienda` llega con la 066 y no cambia una línea de aquí.
 */
export {
  crearPresentacion,
  entradaCrearPresentacion,
  precioDePresentacion,
  type PresentacionParaPrecio,
  type ResultadoPresentacion,
} from './presentaciones.ts';

export {
  entradaAbonoFiado,
  entradaDepositoEnvase,
  entradaRegistrarComision,
  moverDepositoEnvase,
  registrarAbonoFiado,
  registrarComision,
  uuidDeProveedor,
  type ResultadoComision,
  type ResultadoPasivo,
} from './pasivos.ts';

export {
  abrirConteo,
  capturarConteo,
  cerrarConteo,
  entradaAbrirConteo,
  entradaCapturarConteo,
  entradaCerrarConteo,
  zonasPendientesDeConteo,
  type ResultadoAbrirConteo,
  type ResultadoCapturarConteo,
  type ResultadoCerrarConteo,
} from './conteo.ts';

export {
  entradaSugerirPedido,
  sugerenciaDePedido,
  type PedidoSugerido,
  type RenglonSugerido,
} from './sugerencia.ts';

export { entradaRegistrarRedondeo, registrarRedondeo, type ResultadoRedondeo } from './redondeo.ts';
