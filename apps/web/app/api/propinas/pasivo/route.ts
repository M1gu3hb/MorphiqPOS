import { anotarPropinaPorEntregar } from '@morphiqpos/app/propinas';

import { manejadorDeComando } from '~/servidor/ruta';

/** F-260 · La propina de tarjeta entra como DEUDA del negocio, no como venta. */
export const POST = manejadorDeComando(anotarPropinaPorEntregar);

export const runtime = 'nodejs';
