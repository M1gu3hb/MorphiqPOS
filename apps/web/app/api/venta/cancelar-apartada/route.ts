import { cancelarApartada } from '@morphiqpos/app/venta';

import { manejadorDeComando } from '~/servidor/ruta';

/** F-224 · Cancelar una venta apartada, con su motivo: se cobra o se cancela, nunca se queda. */
export const POST = manejadorDeComando(cancelarApartada);

export const runtime = 'nodejs';
