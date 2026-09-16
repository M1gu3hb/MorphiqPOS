import { calibrarPeso } from '@morphiqpos/app/ferreteria';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * F-151 · Cuanto pesa UNA pieza, en miligramos enteros.
 *
 * Se declara una vez con una muestra grande, y va separado de contar a
 * proposito: si cada conteo recalibrara, la existencia se ajustaria sola a lo
 * que diga la bascula ese dia, que es como un inventario deja de significar
 * nada.
 */
export const POST = manejadorDeComando(calibrarPeso);

export const runtime = 'nodejs';
