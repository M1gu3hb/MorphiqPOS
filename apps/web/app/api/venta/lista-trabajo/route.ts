import { capturarListaTrabajo } from '@morphiqpos/app/ferreteria';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * F-153 · Capturar el papel del albañil. No es una cotización: no lleva
 * vigencia ni se aprueba.
 */
export const POST = manejadorDeComando(capturarListaTrabajo);

export const runtime = 'nodejs';
