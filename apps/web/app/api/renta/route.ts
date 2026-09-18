import { sacarEnRenta } from '@morphiqpos/app/ferreteria';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * F-147 · La herramienta que sale y TIENE que volver.
 *
 * Es el envase retornable de abarrotes con otro nombre: el deposito no es
 * ingreso, es dinero del cliente que pasa por el cajon. Contarlo como venta
 * infla el dia de la renta y descuadra el de la devolucion, con dos errores del
 * mismo tamano y signo contrario -que es justo por que nadie los detecta-.
 */
export const POST = manejadorDeComando(sacarEnRenta);

export const runtime = 'nodejs';
