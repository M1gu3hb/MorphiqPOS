import { marcarRetazo } from '@morphiqpos/app/ferreteria';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * F-145 · El pedazo que ya no se vende al metro: se remata.
 *
 * Sin esta ruta, una pieza abierta no podia declararse retazo, y el retazo es la
 * unica merma con recuperacion: un metro de cable que sobra se vende, ocho
 * centimetros no. Tratarlos igual es lo que hace que el inventario nunca cuadre.
 */
export const POST = manejadorDeComando(marcarRetazo);

export const runtime = 'nodejs';
