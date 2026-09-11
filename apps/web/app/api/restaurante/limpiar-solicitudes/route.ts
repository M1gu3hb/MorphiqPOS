import { limpiarSolicitudes } from '@morphiqpos/app/restaurante';

import { manejadorDeComando } from '~/servidor/ruta';

/** E7-3 · borra el historial de avisos en una sentencia, con el conteo real. */
export const POST = manejadorDeComando(limpiarSolicitudes);

export const runtime = 'nodejs';
