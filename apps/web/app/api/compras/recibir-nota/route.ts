import { recibirNota } from '@morphiqpos/app/abarrotes';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * F-106 + F-631 · La nota del repartidor, con sus caducidades.
 *
 * El asiento lo hace `registrarCompra` TAL CUAL -costo promedio ponderado,
 * insumos nuevos, caja si fue de contado-. Lo que anade es la fila de
 * `caducidades`: sin ella, capturar la fecha en la entrada no alimenta la lista
 * de la manana, y a la semana nadie la captura.
 *
 * Las dos escrituras caen o no caen juntas: si la compra entra y las caducidades
 * no, el inventario sube y la lista no ve la leche que caduca el jueves.
 */
export const POST = manejadorDeComando(recibirNota);

export const runtime = 'nodejs';
