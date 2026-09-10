import { liquidarPropinas } from '@morphiqpos/app/propinas';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * `POST /api/propinas/liquidar` — E6-7.
 *
 * Una transacción: crea la liquidación con su folio `LIQ` y marca las órdenes.
 * El importe NO viaja en el cuerpo; lo suma el servidor de `pagos.propina_centavos`.
 */
export const POST = manejadorDeComando(liquidarPropinas);

export const runtime = 'nodejs';
