import 'server-only';

/**
 * @morphiqpos/app — los casos de uso.
 *
 * Aqui vive toda la logica critica (A-21). El envoltorio `comando()` es lo que
 * hace que un caso de uso no tenga que reimplementar validacion, permiso,
 * paquete, transaccion, idempotencia, auditoria ni traduccion de errores.
 */
export {
  crearComando,
  definirComando,
  mensajeDe,
  type ContextoComando,
  type Dependencias,
  type DefinicionComando,
  type PeticionComando,
  type RepositorioComandos,
} from './comando.ts';

export type {
  DatosReclamacion,
  EjecucionGuardada,
  FilaAuditoria,
  Reclamacion,
} from './repositorio.ts';
