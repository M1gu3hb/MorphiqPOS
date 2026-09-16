import { cortarMaterial } from '@morphiqpos/app/ferreteria';

import { manejadorDeComando } from '~/servidor/ruta';

/** F-150 · Cortar material continuo: lo que sale, lo que queda y la merma. */
export const POST = manejadorDeComando(cortarMaterial);

export const runtime = 'nodejs';
