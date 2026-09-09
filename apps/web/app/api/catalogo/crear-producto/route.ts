import { crearProducto } from '@morphiqpos/app/catalogo';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * Ruta de ejemplo del patron de comando (F1.1-X-01).
 *
 * Estas dos lineas son TODO lo que hace falta para exponer un comando por HTTP.
 * El envoltorio ya trae validacion, rol, paquete, transaccion, idempotencia,
 * auditoria, correlation id y errores tipados; el adaptador resuelve el ambito
 * desde la cookie y traduce el resultado a un status.
 *
 * Se eligio un comando del carril B a proposito: es exactamente el patron que
 * Codex necesita para cablear sus pantallas, y asi queda demostrado sobre
 * codigo real en vez de sobre un ejemplo de juguete.
 */
export const POST = manejadorDeComando(crearProducto);

export const runtime = 'nodejs';
