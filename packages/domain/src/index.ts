/**
 * @morphiqpos/domain — reglas puras.
 *
 * Entra un objeto, sale un objeto. Cero I/O, cero React, cero SQL.
 * La prohibicion la impone tambien el compilador: el tsconfig no incluye
 * @types/node ni la libreria DOM, asi que aqui no existe ni `console.log`.
 */
export * as dinero from './dinero/index';
