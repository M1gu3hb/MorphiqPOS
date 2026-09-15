export { dividirCuentaComando, entradaDividirCuenta } from './division.ts';
import 'server-only';

/**
 * Los seis comandos de mesas y comandas (F1-02 E6-2, E6-4, E6-6 y E6-8).
 *
 * Todo lo que en el sistema de Miguel eran llamadas sueltas desde el navegador
 * —con `.catch(() => {})` encima— aquí es una transacción por comando: o
 * confirma todo, o no persiste nada (R10).
 *
 * El sexto es `cancelar_orden`, y no es una función nueva: es la salida que le
 * faltaba al ciclo. Sin ella una cuenta con líneas sólo se podía cobrar, y la
 * mesa del cliente que se va sin pagar quedaba fuera de servicio.
 */

export { cancelarOrden } from './cancelacion.ts';
export type { ResultadoCancelacion } from './cancelacion.ts';

export { abrirMesa, liberarMesa } from './mesas.ts';
export type { ResultadoAbrirMesa, ResultadoLiberarMesa } from './mesas.ts';

export { enviarPedido } from './pedido.ts';
export type { ComandaEmitida, ResultadoEnviarPedido } from './pedido.ts';

export { entregarPedidos, transicionarPedido } from './preparacion.ts';
export type { ResultadoEntrega, ResultadoTransicion } from './preparacion.ts';

export { solicitarCuenta } from './cuenta.ts';
export type { Precuenta } from './cuenta.ts';

export { entradaRotarQr, rotarQr } from './qr.ts';
export type { ResultadoRotarQr } from './qr.ts';

export {
  agruparEnComandas,
  areasDe,
  resolverEstacion,
  type AreaComanda,
  type EstacionCandidata,
  type EstacionResuelta,
  type GrupoDeComanda,
} from './estaciones.ts';

export {
  esTransicionValida,
  estadoComandaDeItem,
  estadoItemDe,
  evaluarTransicion,
  mesaTrasComanda,
  type EstadoComanda,
  type EstadoItem,
  type EstadoMesa,
} from './transiciones.ts';

/**
 * El lado del PERSONAL del portal QR y la asignación de mesero (E7-3, E6-2).
 *
 * Los tres cierran el mismo defecto por tres caminos: la pantalla decidía en el
 * navegador a quién se acredita el trabajo, cuántas filas se borraron y de quién
 * es la mesa. Ahora las tres cosas las decide el servidor.
 */
export {
  asignarMesero,
  atenderSolicitud,
  limpiarSolicitudes,
  vaciarSolicitudes,
} from './solicitudes.ts';
export type {
  ResultadoAsignarMesero,
  ResultadoAtenderSolicitud,
  ResultadoLimpiarSolicitudes,
} from './solicitudes.ts';

export {
  esTransicionDeSolicitudValida,
  evaluarSolicitud,
  ESTADOS_SOLICITUD,
  type EstadoSolicitud,
} from './solicitudes.ts';

export {
  crearEstacion,
  entradaCrearEstacion,
  type ResultadoCrearEstacion,
} from './estacion-crear.ts';

export {
  anularLineaComando,
  entradaAnularLinea,
  type ResultadoAnulacion,
} from './anulacion-linea.ts';

export {
  cambiarMesaComando,
  entradaCambiarMesa,
  type ResultadoCambioDeMesa,
} from './cambio-de-mesa.ts';

export {
  cambiarDeMesa,
  mesaEnSala,
  registrarEventoMesa,
  type MesaEnSala,
} from './sala-escrituras.ts';

export {
  entradaSepararMesas,
  entradaUnirMesas,
  separarMesasComando,
  unirMesasComando,
  type ResultadoSeparacion,
  type ResultadoUnion,
} from './union-de-mesas.ts';

export { separarMesas, unionAbiertaDeMesa, unirMesas } from './sala-escrituras.ts';

export {
  entradaRotacion,
  rotacionDeMesas,
  type Rotacion,
  type RotacionPorMesa,
} from './ocupacion.ts';

export {
  entradaMoverEspera,
  entradaRegistrarEspera,
  entradaSentarEspera,
  moverEspera,
  registrarEspera,
  sentarEspera,
  type ResultadoMoverEspera,
  type ResultadoRegistroEspera,
  type ResultadoSentarEspera,
} from './espera.ts';

export {
  entradaMarcharTiempo,
  marcharTiempo,
  type ComandaMarchada,
  type ResultadoMarcha,
} from './marcha.ts';

export {
  entradaTiempos,
  tiemposDePreparacion,
  type TiempoDeProducto,
  type TiemposDePreparacion,
} from './tiempos.ts';

export {
  entradaRelevarResponsable,
  relevarResponsable,
  type CuentaRelevada,
  type ResultadoRelevo,
} from './relevo.ts';
