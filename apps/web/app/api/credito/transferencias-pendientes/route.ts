import { transferenciasPendientes } from '@morphiqpos/app/cartera';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * F-212 · Lo que hay que cotejar contra el banco antes de cerrar.
 *
 * El comando existía y **no tenía puerta**: `ferreteria/Caja.tsx` pintaba su
 * sección de «transferencias por confirmar» a partir de un estado de venta
 * inventado (`transferencia_por_confirmar`, que no existe en la base), así que
 * la lista estaba siempre vacía y los pagos de crédito sin confirmar —el 20 % al
 * 35 % del valor de una ferretería— no se veían en ningún sitio.
 *
 * Es un POST aunque no escriba nada, como el resto de las lecturas que pasan por
 * un comando: la ventana de horas va en el cuerpo, y así la consulta hereda la
 * validación de origen, la sesión y los roles sin una segunda puerta que
 * mantener.
 */
export const POST = manejadorDeComando(transferenciasPendientes);

export const runtime = 'nodejs';
