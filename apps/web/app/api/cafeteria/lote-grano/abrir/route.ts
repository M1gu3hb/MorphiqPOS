import { abrirLoteGrano } from '@morphiqpos/app/cafeteria';

import { manejadorDeComando } from '~/servidor/ruta';

export const POST = manejadorDeComando(abrirLoteGrano);

export const runtime = 'nodejs';
