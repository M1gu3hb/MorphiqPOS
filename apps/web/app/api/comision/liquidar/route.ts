import { liquidarProfesional } from '@morphiqpos/app/salon';

import { manejadorDeComando } from '~/servidor/ruta';

export const POST = manejadorDeComando(liquidarProfesional);

export const runtime = 'nodejs';
