import { motivosDeMerma } from '@morphiqpos/app/inventario';

import { manejadorDeComando } from '~/servidor/ruta';

/** Los motivos de merma del tronco y del giro del negocio: para elegir, no para teclear. */
export const POST = manejadorDeComando(motivosDeMerma);

export const runtime = 'nodejs';
