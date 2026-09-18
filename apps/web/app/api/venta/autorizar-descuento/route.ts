import { autorizarDescuento } from '@morphiqpos/app/venta';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * F-205 · Autorizar un descuento por encima del tope de quien lo pide.
 *
 * Quien autoriza entra con SU PIN y ejecuta esto con su sesión: el ámbito sale
 * de ahí y nunca del cuerpo (R16). Un `autoriza_empleo_id` en la entrada sería
 * literalmente un campo para ponerle el nombre de otro a lo que uno hace.
 */
export const POST = manejadorDeComando(autorizarDescuento);

export const runtime = 'nodejs';
