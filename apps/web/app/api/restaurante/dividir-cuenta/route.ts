import { dividirCuentaComando } from '@morphiqpos/app/restaurante';

import { manejadorDeComando } from '~/servidor/ruta';

export const POST = manejadorDeComando(dividirCuentaComando);

export const runtime = 'nodejs';
