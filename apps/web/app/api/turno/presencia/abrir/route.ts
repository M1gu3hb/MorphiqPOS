import { abrirPresencia } from '@morphiqpos/app/cafeteria';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * F-248 · La hora a la que alguien entró al turno.
 *
 * La pantalla del PIN publicaba aquí y **esto no existía**. Se tragaba el fallo a
 * propósito —lo que decide si se entra es el PIN— así que nadie lo notó: se
 * entraba al turno y la hora no quedaba en ninguna parte. Y sin esas horas el
 * reparto del bote no tiene base: reparte por minutos de presencia, y un turno sin
 * presencias reparte cero entre cuatro personas que trabajaron ocho horas.
 *
 * Al lado de `/api/turno/presencia/ajustar`, que ya existía para corregirla: se
 * podía corregir una hora que nunca se registró.
 */
export const POST = manejadorDeComando(abrirPresencia);

export const runtime = 'nodejs';
