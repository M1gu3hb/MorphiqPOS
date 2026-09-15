import { guardarEsquemaPropina } from '@morphiqpos/app/propinas';

import { manejadorDeComando } from '~/servidor/ruta';

export const POST = manejadorDeComando(guardarEsquemaPropina);

export const runtime = 'nodejs';
