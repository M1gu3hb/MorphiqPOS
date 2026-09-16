import { pagarAProveedor } from '@morphiqpos/app/compras';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * F-635 · Pagarle al proveedor. Lo MAS VIEJO primero: aplicarlo a la factura
 * mas nueva deja una de hace dos años en el tramo de 90 dias para siempre.
 */
export const POST = manejadorDeComando(pagarAProveedor);

export const runtime = 'nodejs';
