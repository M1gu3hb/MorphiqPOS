import { registrarMermaBarra } from '@morphiqpos/app/cafeteria';

import { manejadorDeComando } from '~/servidor/ruta';

export const POST = manejadorDeComando(registrarMermaBarra);

export const runtime = 'nodejs';
