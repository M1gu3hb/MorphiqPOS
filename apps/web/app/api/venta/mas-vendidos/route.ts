import { masVendidos } from '@morphiqpos/app/venta';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * F1–F8 del cobro de la tienda: los ocho que el negocio de verdad vende, contados en el
 * servidor. Ver `venta/mas-vendidos.ts`.
 */
export const POST = manejadorDeComando(masVendidos);

export const runtime = 'nodejs';
