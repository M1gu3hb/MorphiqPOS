import { contarLeche } from '@morphiqpos/app/cafeteria';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * El conteo de leche de la barra, que se hace de pie.
 *
 * Es el insumo que mas se pierde y el unico que se mide en dos unidades a la
 * vez: cartones cerrados y UNO abierto por la mitad. Nadie mira un carton y dice
 * «quedan 380»: se cuenta en cuartos, que es como de verdad se ve.
 *
 * Y NO ajusta solo. Un carton mal contado a las siete de la manana se
 * convertiria en una merma de dos litros sin que nadie lo mirara, y a la segunda
 * vez el barista deja de contar.
 */
export const POST = manejadorDeComando(contarLeche);

export const runtime = 'nodejs';
