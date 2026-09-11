import { atenderSolicitud } from '@morphiqpos/app/restaurante';

import { manejadorDeComando } from '~/servidor/ruta';

/** E7-3 · el personal atiende, resuelve o cancela el aviso del comensal. */
export const POST = manejadorDeComando(atenderSolicitud);

export const runtime = 'nodejs';
