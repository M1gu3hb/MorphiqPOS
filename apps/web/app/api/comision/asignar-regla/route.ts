import { asignarRegla } from '@morphiqpos/app/salon';

import { manejadorDeComando } from '~/servidor/ruta';

export const POST = manejadorDeComando(asignarRegla);

export const runtime = 'nodejs';
