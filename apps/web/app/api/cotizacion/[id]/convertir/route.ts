import { convertirCotizacion } from '@morphiqpos/app/ferreteria';

import { manejadorDeComandoConParametro } from '~/servidor/ruta';

/**
 * F-604 · Convertir la cotizacion en pedido. EXIGE vigencia: honrar una
 * vencida tres meses despues es cerrar en perdida la venta que se celebro, y
 * es exactamente lo que pasa hoy con la hoja de Excel.
 *
 * El identificador viaja EN LA RUTA y se mete en el cuerpo antes de validar.
 */
export const POST = manejadorDeComandoConParametro(convertirCotizacion, 'cotizacionId');

export const runtime = 'nodejs';
