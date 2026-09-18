import { comprobanteDeLiquidacion } from '@morphiqpos/app/salon';

import { manejadorDeComandoConParametro } from '~/servidor/ruta';

/**
 * F-427 · El comprobante se RECONSTRUYE, no se guarda.
 *
 * Y el detalle sale de las MISMAS filas que la liquidacion marco. Volver a
 * calcularlo por fechas daria un comprobante que no suma su propio total en
 * cuanto una comision se causara fuera del periodo y se liquidara dentro, que
 * es precisamente lo que pasa con el servicio del dia 15.
 */
export const POST = manejadorDeComandoConParametro(comprobanteDeLiquidacion, 'liquidacionId');

export const runtime = 'nodejs';
