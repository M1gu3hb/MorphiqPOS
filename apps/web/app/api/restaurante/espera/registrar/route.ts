import { registrarEspera } from '@morphiqpos/app/restaurante';

import { manejadorDeComando } from '~/servidor/ruta';

export const POST = manejadorDeComando(registrarEspera);

export const runtime = 'nodejs';
