import { corteDeTurno } from '@morphiqpos/app/caja';

import { manejadorDeComando } from '~/servidor/ruta';

/** E8-3 · el arqueo de media jornada. No cierra la caja. */
export const POST = manejadorDeComando(corteDeTurno);

export const runtime = 'nodejs';
