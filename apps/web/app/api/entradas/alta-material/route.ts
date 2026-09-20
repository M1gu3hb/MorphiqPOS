import { altaDeMaterial } from '@morphiqpos/app/ferreteria';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * F-631 · El renglón de la nota que no casó con nada.
 *
 * El botón ALTA de cada renglón sin emparejar publicaba aquí y **esto no existía**.
 * Sin él, ese renglón se queda FUERA de la entrada: el material entra al anaquel y
 * el inventario no se entera, que es el defecto que la pantalla existe para cerrar.
 *
 * Es el alta RÁPIDA —nombre y costo, marcado como incompleto— porque quien captura
 * tiene al repartidor esperando. El precio nace en cero y sale en la lista de
 * pendientes: un precio inventado aquí acaba en la etiqueta sin que nadie lo revise.
 */
export const POST = manejadorDeComando(altaDeMaterial);

export const runtime = 'nodejs';
