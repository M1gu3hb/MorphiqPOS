import { marcarEstacionGeneral } from '@morphiqpos/app/restaurante';

import { manejadorDeComando } from '~/servidor/ruta';

/** DP-10.1 · nombrar general una estación que ya existe. Nunca cambia la general de mano. */
export const POST = manejadorDeComando(marcarEstacionGeneral);

export const runtime = 'nodejs';
