import { moverEspera } from '@morphiqpos/app/restaurante';

import { manejadorDeComando } from '~/servidor/ruta';

export const POST = manejadorDeComando(moverEspera);

export const runtime = 'nodejs';
