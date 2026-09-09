/**
 * @morphiqpos/contracts — el unico paquete que todos pueden importar.
 *
 * Tipos de entidad, DTOs, errores tipados, eventos y puntos de extension.
 * Sin dependencias: si algo aqui necesita importar otro paquete del monorepo,
 * es senal de que no pertenece a contracts.
 */
export * from './errores/index.ts';
export * from './entorno/index.ts';
export * from './comandos/index.ts';
export * from './configuracion/index.ts';
