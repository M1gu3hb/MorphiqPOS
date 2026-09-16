import { retomarVenta } from '@morphiqpos/app/venta';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * F-224 · Retomar la venta apartada.
 *
 * Es la otra mitad de `venta/suspender`, y estaba sin ruta: el comando existia,
 * la puerta contaba el archivo de suspender como presente, y apartar una venta
 * sin poder retomarla deja al cliente esperando y al cajero sin salida.
 */
export const POST = manejadorDeComando(retomarVenta);

export const runtime = 'nodejs';
