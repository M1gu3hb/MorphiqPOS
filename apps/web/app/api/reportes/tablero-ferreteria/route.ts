import { tableroDeFerreteria } from '@morphiqpos/app/reportes';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * F-056 · El tablero de la ferretería: sus ocho indicadores, en una llamada.
 *
 * De LECTURA —`escribe: false`—, así que no toma clave de idempotencia ni deja
 * auditoría. Sigue siendo POST porque pasa por `comando()`, que resuelve el ámbito y
 * comprueba el rol y la plantilla: la cartera de un negocio no la abre un cajero.
 */
export const POST = manejadorDeComando(tableroDeFerreteria);

export const runtime = 'nodejs';
