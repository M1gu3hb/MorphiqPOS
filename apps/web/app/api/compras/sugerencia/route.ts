import { sugerenciaDePedido } from '@morphiqpos/app/abarrotes';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * `05-DATOS-Y-BACKEND.md` §6 la propone como
 * `compras/sugerencia/[proveedorId]`. Va como POST sin parámetro de ruta porque
 * la consulta necesita tres datos —proveedor, almacén y ventana de venta— y
 * meter dos de ellos en la cadena de consulta los dejaría fuera de la validación
 * que `definirComando` ya hace sobre el cuerpo.
 */
export const POST = manejadorDeComando(sugerenciaDePedido);

export const runtime = 'nodejs';
