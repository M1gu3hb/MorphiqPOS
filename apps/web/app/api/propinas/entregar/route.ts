import { entregarPropina } from '@morphiqpos/app/propinas';

import { manejadorDeComando } from '~/servidor/ruta';

/** F-260 · Entregar la propina: una contrapartida en el ledger y un retiro de caja. */
export const POST = manejadorDeComando(entregarPropina);

export const runtime = 'nodejs';
