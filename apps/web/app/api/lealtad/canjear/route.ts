import { canjearPremio } from '@morphiqpos/app/cafeteria';

import { manejadorDeComando } from '~/servidor/ruta';

/** F-934 · Canjear el premio. El costo se congela en el movimiento. */
export const POST = manejadorDeComando(canjearPremio);

export const runtime = 'nodejs';
