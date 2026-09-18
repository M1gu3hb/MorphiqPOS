import { recibirGarantia } from '@morphiqpos/app/ferreteria';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * F-146 · Lo que se manda al proveedor y no vuelve: entre $20,000 y $60,000 al
 * ano que hoy nadie cuenta.
 *
 * El ticket NO es obligatorio: media ferreteria acepta la garantia con la caja,
 * y exigirlo es perder al cliente para ahorrarse una columna nula. Y «se la
 * cambie» no es «se la debo»: solo en el primer caso sale una pieza buena del
 * anaquel.
 */
export const POST = manejadorDeComando(recibirGarantia);

export const runtime = 'nodejs';
