import { resolverGarantia } from '@morphiqpos/app/ferreteria';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * F-146 · Como acabo la garantia: cambio, nota de credito, o nada.
 *
 * La mitad que CIERRA el ciclo. Sin ella se podia registrar lo que se manda al
 * proveedor y nunca lo que volvio, que es precisamente el numero que la
 * ferreteria no tiene hoy: entre $20,000 y $60,000 al ano que nadie cuenta.
 */
export const POST = manejadorDeComando(resolverGarantia);

export const runtime = 'nodejs';
