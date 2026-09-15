import { abrirConteo } from '@morphiqpos/app/abarrotes';

import { manejadorDeComando } from '~/servidor/ruta';

export const POST = manejadorDeComando(abrirConteo);

export const runtime = 'nodejs';
