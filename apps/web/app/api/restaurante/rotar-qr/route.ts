import { rotarQr } from '@morphiqpos/app/restaurante';

import { manejadorDeComando } from '~/servidor/ruta';

/** C-5 · rota en servidor la credencial pública de una mesa. */
export const POST = manejadorDeComando(rotarQr);

export const runtime = 'nodejs';
