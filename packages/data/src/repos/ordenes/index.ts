import 'server-only';

/**
 * El repositorio de órdenes, en tres piezas por ciclo de vida.
 *
 * `carrito` se edita muchas veces, `cierre` se escribe una vez y no se
 * deshace, `ticket` sólo lee. Separarlos deja claro qué toca dinero.
 */

export * from './carrito.ts';
export * from './cierre.ts';
export * from './ticket.ts';
