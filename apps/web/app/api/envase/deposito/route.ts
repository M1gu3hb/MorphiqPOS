import { moverDepositoEnvase } from '@morphiqpos/app/abarrotes';

import { manejadorDeComando } from '~/servidor/ruta';

export const POST = manejadorDeComando(moverDepositoEnvase);

export const runtime = 'nodejs';
