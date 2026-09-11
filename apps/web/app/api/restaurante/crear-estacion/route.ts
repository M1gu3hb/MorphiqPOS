import { crearEstacion } from '@morphiqpos/app/restaurante';

import { manejadorDeComando } from '~/servidor/ruta';

/** E6-10 · crear una estación. `es_general` lo decide el servidor. */
export const POST = manejadorDeComando(crearEstacion);

export const runtime = 'nodejs';
