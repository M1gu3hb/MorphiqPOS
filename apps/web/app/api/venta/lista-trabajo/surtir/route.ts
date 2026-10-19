import { surtirLista } from '@morphiqpos/app/ferreteria';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * F-153 · Surtir la lista del albañil: lo que se entrega ahora va a UNA nota de
 * mostrador con su folio, y cada renglón cuenta lo entregado.
 */
export const POST = manejadorDeComando(surtirLista);

export const runtime = 'nodejs';
