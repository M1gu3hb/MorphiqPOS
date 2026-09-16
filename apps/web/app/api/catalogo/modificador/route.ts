import { crearModificadorProducto } from '@morphiqpos/app/catalogo';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * E9-2 · Un modificador suelto, con sus opciones.
 *
 * `catalogo/modificadores` guarda el juego ENTERO en una transaccion, que es lo
 * correcto al editar. Crear uno solo es otra operacion y no tenia ruta.
 */
export const POST = manejadorDeComando(crearModificadorProducto);

export const runtime = 'nodejs';
