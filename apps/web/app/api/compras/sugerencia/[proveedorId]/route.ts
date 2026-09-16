import { sugerenciaDePedido } from '@morphiqpos/app/abarrotes';

import { manejadorDeComandoConParametro } from '~/servidor/ruta';

/**
 * Qué pedirle a este proveedor, contra lo que se vendió.
 *
 * `compras/sugerencia` sin parámetro ya existía y se queda: las dos llaman al
 * mismo comando. Ésta es la forma que declara el documento, y con el proveedor
 * en la ruta cada línea del registro de acceso señala a un proveedor.
 *
 * El identificador viaja EN LA RUTA y se mete en el cuerpo antes de validar:
 * así cada línea del registro de acceso señala a un registro concreto, y aun
 * así nada entra sin pasar por el mismo `zod` que todo lo demás.
 */
export const POST = manejadorDeComandoConParametro(sugerenciaDePedido, 'proveedorId');

export const runtime = 'nodejs';
