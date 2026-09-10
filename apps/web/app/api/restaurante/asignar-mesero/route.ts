import { asignarMesero } from '@morphiqpos/app/restaurante';

import { manejadorDeComando } from '~/servidor/ruta';

/** E6-2 · el mesero de la sesión toma la mesa, si no la atiende ya otro. */
export const POST = manejadorDeComando(asignarMesero);

export const runtime = 'nodejs';
