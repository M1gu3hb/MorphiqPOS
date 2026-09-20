import { reporteDeOcupacion } from '@morphiqpos/app/salon';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * F-426 · La ocupacion, medida contra SU horario y no contra el dia natural.
 *
 * Quien trabaja de dos a ocho y llena seis horas esta al 100 %, no al 25 %: el
 * reporte que lo mide contra las veinticuatro dice que sobra gente cuando falta.
 */
export const POST = manejadorDeComando(reporteDeOcupacion);

export const runtime = 'nodejs';
