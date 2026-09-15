import { enviarTraspaso } from '@morphiqpos/app/inventario';

import { manejadorDeComando } from '~/servidor/ruta';

/** F-105 · La primera mitad: sale del almacén de origen. */
export const POST = manejadorDeComando(enviarTraspaso);

export const runtime = 'nodejs';
