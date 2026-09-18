import { restablecerTermino } from '@morphiqpos/app/configuracion';

import { manejadorDeComando } from '~/servidor/ruta';

/** F-017 · Devolver la entidad al nombre que usa su giro. */
export const POST = manejadorDeComando(restablecerTermino);

export const runtime = 'nodejs';
