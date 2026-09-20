import { tableroDeTienda } from '@morphiqpos/app/reportes';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * F-056 · El tablero de la tiendita: sus siete indicadores, en una llamada.
 *
 * Es de LECTURA —`escribe: false`— y por eso no toma clave de idempotencia ni deja
 * auditoría. Sigue siendo POST porque pasa por `comando()`, que es quien resuelve el
 * ámbito y comprueba el rol y la plantilla: el tablero del dueño no lo abre un
 * cajero, y el de una tiendita no existe en un restaurante.
 */
export const POST = manejadorDeComando(tableroDeTienda);

export const runtime = 'nodejs';
