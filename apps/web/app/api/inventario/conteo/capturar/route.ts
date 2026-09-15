import { capturarConteo } from '@morphiqpos/app/abarrotes';

import { manejadorDeComando } from '~/servidor/ruta';

export const POST = manejadorDeComando(capturarConteo);

export const runtime = 'nodejs';
