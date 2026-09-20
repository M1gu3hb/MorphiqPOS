import { registrarRedondeo } from '@morphiqpos/app/abarrotes';

import { manejadorDeComando } from '~/servidor/ruta';

export const POST = manejadorDeComando(registrarRedondeo);

export const runtime = 'nodejs';
