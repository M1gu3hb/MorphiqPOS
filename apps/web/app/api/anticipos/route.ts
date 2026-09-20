import { recibirAnticipo } from '@morphiqpos/app/salon';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * F-414 · Recibir el anticipo de la cita. Es dinero AJENO hasta que el
 * servicio ocurre: contarlo como venta del día adelanta el ingreso, el IVA y
 * la comisión de quien todavía no ha trabajado.
 */
export const POST = manejadorDeComando(recibirAnticipo);

export const runtime = 'nodejs';
