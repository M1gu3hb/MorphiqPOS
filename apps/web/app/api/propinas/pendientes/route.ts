import { propinasPendientes } from '@morphiqpos/app/propinas';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * `POST /api/propinas/pendientes` — lo pendiente del periodo, derivado.
 *
 * Es POST y no GET aunque sólo lea: lleva un cuerpo con el rango y el mesero, y
 * `manejadorDeComando` sólo acepta POST para que ninguna ruta de este árbol se
 * pueda disparar desde un `<img src>` (morphiq-prs §10A).
 */
export const POST = manejadorDeComando(propinasPendientes);

export const runtime = 'nodejs';
