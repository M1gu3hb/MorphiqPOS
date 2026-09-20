import { registrarPagoCredito } from '@morphiqpos/app/cartera';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * F-614 y F-615 · Cobrar un abono de crédito.
 *
 * El pago entra al cajón como DEPÓSITO y no como venta: la venta se registró el
 * día que se fió, y volver a contarla aquí duplicaría el ingreso del mes.
 */
export const POST = manejadorDeComando(registrarPagoCredito);

export const runtime = 'nodejs';
