import 'server-only';

export {
  cerrarDb,
  comprobarConexion,
  conTransaccion,
  obtenerDb,
  obtenerPool,
  type Transaccion,
} from './cliente.ts';

export type { Esquema } from './esquema.ts';
export { crearAlmacenArchivos, type ConfiguracionAlmacen } from './archivos.ts';

export * as repoComandos from './repos/comandos.ts';
export * as repoCatalogo from './repos/catalogo.ts';
export * as repoStock from './repos/stock.ts';

export * as repoSesion from './repos/sesion.ts';
export * as repoIdentidad from './repos/identidad.ts';
export * as repoOrdenes from './repos/ordenes/index.ts';
export * as repoFolios from './repos/folios.ts';
export * as repoCaja from './repos/caja.ts';
export * as repoVentaCatalogo from './repos/venta-catalogo.ts';
export * as repoLimite from './repos/limite.ts';
export * as repoArchivos from './repos/archivos.ts';
export * as repoNegocio from './repos/negocio.ts';
