import { cerrarCotizacion } from '@morphiqpos/app/ferreteria';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * F-607 · Cerrar como perdida EXIGE motivo. «Se perdio» sin motivo es el
 * estado de hoy y no enseña nada.
 */
export const POST = manejadorDeComando(cerrarCotizacion);

export const runtime = 'nodejs';
