import { otorgarSellos } from '@morphiqpos/app/cafeteria';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * F-930 · Identificar a la clienta y darle sus sellos.
 *
 * Los sellos los cuenta el SERVIDOR leyendo `productos.sellos_otorga`. Si
 * vinieran del cliente, el programa de lealtad se podría regalar entero desde
 * la consola del navegador — y en este giro la recurrencia ES el negocio.
 */
export const POST = manejadorDeComando(otorgarSellos);

export const runtime = 'nodejs';
