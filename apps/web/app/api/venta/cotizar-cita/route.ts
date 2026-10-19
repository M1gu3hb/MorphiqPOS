import { cotizarCita } from '@morphiqpos/app/salon';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * La cuenta de una cita ANTES de cobrarla: total, IVA, anticipo, lo que queda por
 * cobrar y cuánto baja la comisión de cada persona con el descuento que se está
 * pensando (`02-DINERO-Y-CAJA §3` del salón). No escribe nada, y calcula con la
 * misma función que el cobro: la estilista ve el número que se va a cobrar.
 */
export const POST = manejadorDeComando(cotizarCita);

export const runtime = 'nodejs';
