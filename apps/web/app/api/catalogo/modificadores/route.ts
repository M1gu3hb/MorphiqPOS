import { guardarModificadores } from '@morphiqpos/app/catalogo';

import { manejadorDeComando } from '~/servidor/ruta';

/** E9-2 · el juego entero de opciones de un producto, en una transacción. */
export const POST = manejadorDeComando(guardarModificadores);

export const runtime = 'nodejs';
