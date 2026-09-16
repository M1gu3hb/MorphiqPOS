import { altaRapida } from '@morphiqpos/app/catalogo';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * F-201 · El alta desde el codigo que no existe, en hora pico.
 *
 * «No esta en el catalogo» tiene hoy dos salidas y las dos son malas: se pierde
 * la venta, o se cobra a mano y no queda registrada. Tres campos y Enter: pedir
 * ocho es lo mismo que no tener alta rapida.
 *
 * Y lo que nace asi queda MARCADO con sus pendientes. Sin esa lista, los
 * cuarenta productos que nacieron en el mostrador se pierden entre los seis mil
 * y nadie vuelve a ponerles costo.
 */
export const POST = manejadorDeComando(altaRapida);

export const runtime = 'nodejs';
