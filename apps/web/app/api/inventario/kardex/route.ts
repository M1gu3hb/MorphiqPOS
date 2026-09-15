import { kardexDeInsumo } from '@morphiqpos/app/inventario';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * F-103 · El kardex de un artículo en un almacén.
 *
 * `POST` aunque sólo lea, igual que `/api/datos/consultar`: el cuerpo lleva
 * rango de fechas y tope, y meterlos en la URL los dejaría en los registros del
 * proxy y en el historial del navegador.
 */
export const POST = manejadorDeComando(kardexDeInsumo);

export const runtime = 'nodejs';
