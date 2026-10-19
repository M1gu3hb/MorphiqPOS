import { guardarRegla } from '@morphiqpos/app/salon';

import { manejadorDeComando } from '~/servidor/ruta';

export const POST = manejadorDeComando(guardarRegla);

export const runtime = 'nodejs';
