import { recibirEntrada } from '@morphiqpos/app/ferreteria';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * F-631 · Guardar la entrada del proveedor.
 *
 * La pantalla de entradas cierra la captura aquí y **esto no existía**: la pantalla
 * que resuelve el dolor de capturar doscientos renglones acababa en el error
 * genérico, así que la entrada se seguía capturando «el fin de semana» —o nunca—, y
 * las del fin de semana dejan existencias en negativo toda la semana siguiente.
 *
 * El asiento es `compras.recibir_nota` tal cual. Aquí se añaden el ALMACÉN —que
 * sale de la sesión, nunca de la petición— el CRÉDITO con su documento por pagar, y
 * el camino por el que se capturó.
 */
export const POST = manejadorDeComando(recibirEntrada);

export const runtime = 'nodejs';
