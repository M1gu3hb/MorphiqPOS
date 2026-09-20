import { liquidarProfesional } from '@morphiqpos/app/salon';

import { manejadorDeComando } from '~/servidor/ruta';

/** F-444 · La liquidación de la profesional, contra el ledger de lo causado. */
export const POST = manejadorDeComando(liquidarProfesional);

export const runtime = 'nodejs';
