import { restablecerModulo } from '@morphiqpos/app/configuracion';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * F-016 · Quitar la perilla y volver al preajuste de la plantilla.
 *
 * Ruta aparte y no un campo de la otra: restablecer no es «apagar con otro
 * valor», es borrar la excepción. Mezclarlas en un solo cuerpo obligaría a
 * inventar un tercer estado —`activo: null`— que nadie sabe leer.
 */
export const POST = manejadorDeComando(restablecerModulo);

export const runtime = 'nodejs';
