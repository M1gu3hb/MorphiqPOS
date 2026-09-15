import 'server-only';

/** Los comandos de caja (F1.1-A-08 y C-10). */

export { abrirCaja, cerrarCaja, registrarMovimientoCaja, type ResultadoCorte } from './sesion.ts';

export { eliminarCorte, entradaEliminarCorte, type ResultadoEliminarCorte } from './eliminacion.ts';

export {
  entradaEstadoCaja,
  estadoDeCaja,
  type EstadoCaja,
  type MovimientoVisible,
} from './consulta.ts';

export { corteDeTurno, entradaCorteTurno, type ResultadoCorteTurno } from './turno.ts';

export { encolarSincronizacionCorte, entradaEncolarSincronizacionCorte } from './sincronizacion.ts';
