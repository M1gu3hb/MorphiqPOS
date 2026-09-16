import { reprogramarCita } from '@morphiqpos/app/salon';

import { manejadorDeComandoConParametro } from '~/servidor/ruta';

/**
 * Mover una cita NO es cancelarla y volver a agendarla. Eso cuesta tres cosas:
 * el folio que la clienta trae anotado, el anticipo que colgaba de la cita, y
 * un historial que dice que falto cuando solo cambio de dia.
 *
 * Tampoco se vuelve a planear: los servicios y las personas son los mismos, asi
 * que la cita entera se DESPLAZA. Y el precio no se toca, porque se congelo al
 * agendar.
 */
export const POST = manejadorDeComandoConParametro(reprogramarCita, 'citaId');

export const runtime = 'nodejs';
