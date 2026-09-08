import 'server-only';

export {
  cerrarDb,
  comprobarConexion,
  conTransaccion,
  obtenerDb,
  obtenerPool,
  type Transaccion,
} from './cliente.ts';

export {
  leerMigraciones,
  migrar,
  type Migracion,
  type ResultadoMigracion,
} from './migraciones/ejecutor.ts';

export type { Esquema } from './esquema.ts';

export * as repoComandos from './repos/comandos.ts';
export * as repoStock from './repos/stock.ts';
