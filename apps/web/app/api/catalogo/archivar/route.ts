import { archivarProducto } from '@morphiqpos/app/catalogo';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * Archivar un producto, que NO es borrarlo.
 *
 * Un producto con ventas no se puede borrar sin romper el historico, y por eso el
 * comando archiva. Sin ruta, la unica forma de quitar algo del catalogo era
 * dejarlo ahi, que es como un catalogo de mil renglones deja de servir.
 */
export const POST = manejadorDeComando(archivarProducto);

export const runtime = 'nodejs';
