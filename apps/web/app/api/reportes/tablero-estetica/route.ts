import { tableroDeEstetica } from '@morphiqpos/app/reportes';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * F-056 · El tablero de la estética: sus ocho indicadores, en una llamada.
 *
 * De LECTURA —`escribe: false`—, así que no toma clave de idempotencia ni deja
 * auditoría. Sigue siendo POST porque pasa por `comando()`: el ámbito, el rol y la
 * plantilla los comprueba él, y este tablero es de quien mira el negocio.
 */
export const POST = manejadorDeComando(tableroDeEstetica);

export const runtime = 'nodejs';
