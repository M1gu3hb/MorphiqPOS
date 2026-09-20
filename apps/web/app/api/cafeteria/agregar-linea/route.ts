import { agregarBebida } from '@morphiqpos/app/cafeteria';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * F-027 · La bebida con sus opciones.
 *
 * La pantalla publicaba aquí desde el primer día y **esto no existía**: elegir
 * leche de avena, tamaño y «sin crema» devolvía la página de error de Next.
 *
 * Y no es un alias de `/api/venta/agregar-linea`: ese comando no sabe nada de
 * opciones —ninguno escribía `orden_linea_modificadores`— ni crea el carrito, y
 * esta pantalla se abre desde el menú sin pasar por ninguna que lo cree. La ruta
 * se queda con el nombre que la pantalla ya usaba porque lo que se agrega es una
 * BEBIDA, con sus modificadores y su alergia, no una línea cualquiera.
 */
export const POST = manejadorDeComando(agregarBebida);

export const runtime = 'nodejs';
