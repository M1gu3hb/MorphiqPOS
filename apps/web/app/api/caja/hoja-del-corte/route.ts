import { hojaDelCorte } from '@morphiqpos/app/caja';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * Todo lo que el PDF del corte enseña, de una sesión de caja: el tronco común y lo propio
 * del giro (`02-DINERO-Y-CAJA.md` §9.3 de cada modelo). No escribe nada; los costos sólo
 * salen para quien puede verlos (C.6 de la 2.4).
 */
export const POST = manejadorDeComando(hojaDelCorte);

export const runtime = 'nodejs';
