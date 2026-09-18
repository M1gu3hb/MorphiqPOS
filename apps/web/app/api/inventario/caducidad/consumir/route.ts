import { consumirCaducidad } from '@morphiqpos/app/abarrotes';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * F-106 · Lo que se consumio de un lote que caduca.
 *
 * `inventario/caducidad` registraba la fecha y la cantidad; nada podia anotar lo
 * consumido, y la diferencia entre las dos columnas ES la merma de ese anaquel.
 *
 * Y NO se resta de la existencia: eso lo hace la venta. Restarlo aqui tambien
 * descontaria dos veces.
 */
export const POST = manejadorDeComando(consumirCaducidad);

export const runtime = 'nodejs';
