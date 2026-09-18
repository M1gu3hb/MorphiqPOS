import { registrarCaducidad } from '@morphiqpos/app/abarrotes';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * F-106 · La caducidad SIN lote: una fecha, una cantidad y el producto.
 *
 * El lote completo es de farmacia. Una tiendita maneja «la leche que llego el
 * jueves», y pedirle un numero de lote por caja es pedirle algo que no va a
 * hacer. Esto cubre el 90 % del dolor con el 10 % de la captura.
 *
 * Y lo consumido NO se resta de lo que entro: la diferencia entre las dos
 * columnas ES la merma que ese producto genera en ese anaquel.
 */
export const POST = manejadorDeComando(registrarCaducidad);

export const runtime = 'nodejs';
