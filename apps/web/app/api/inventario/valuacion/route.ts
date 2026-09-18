import { tomarValuacion } from '@morphiqpos/app/inventario';

import { manejadorDeComando } from '~/servidor/ruta';

/** F-108 · La foto del valor del inventario, con su detalle por artículo. */
export const POST = manejadorDeComando(tomarValuacion);

export const runtime = 'nodejs';
