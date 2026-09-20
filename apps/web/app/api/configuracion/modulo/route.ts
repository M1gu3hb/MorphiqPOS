import { fijarModulo } from '@morphiqpos/app/configuracion';

import { manejadorDeComando } from '~/servidor/ruta';

/** F-016 · Encender o apagar un módulo de este negocio, con su motivo. */
export const POST = manejadorDeComando(fijarModulo);

export const runtime = 'nodejs';
