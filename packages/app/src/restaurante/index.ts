import 'server-only';

/**
 * Los cinco comandos de mesas y comandas (F1-02 E6-2, E6-4, E6-6 y E6-8).
 *
 * Todo lo que en el sistema de Miguel eran llamadas sueltas desde el navegador
 * —con `.catch(() => {})` encima— aquí es una transacción por comando: o
 * confirma todo, o no persiste nada (R10).
 */

export { abrirMesa, liberarMesa } from './mesas.ts';
export type { ResultadoAbrirMesa, ResultadoLiberarMesa } from './mesas.ts';

export { enviarPedido } from './pedido.ts';
export type { ComandaEmitida, ResultadoEnviarPedido } from './pedido.ts';

export { entregarPedidos, transicionarPedido } from './preparacion.ts';
export type { ResultadoEntrega, ResultadoTransicion } from './preparacion.ts';

export { solicitarCuenta } from './cuenta.ts';
export type { Precuenta } from './cuenta.ts';

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
