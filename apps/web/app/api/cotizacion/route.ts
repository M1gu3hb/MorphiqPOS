import { crearCotizacion } from '@morphiqpos/app/ferreteria';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * F-600 · Crear la cotizacion. Los totales los calcula el SERVIDOR: aceptar
 * el del cliente es aceptar su precio, y en cien mil pesos eso no es un
 * redondeo. La vigencia es obligatoria porque el acero cambia cada semana.
 */
export const POST = manejadorDeComando(crearCotizacion);

export const runtime = 'nodejs';
