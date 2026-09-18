import { cerrarConteo } from '@morphiqpos/app/abarrotes';

import { manejadorDeComando } from '~/servidor/ruta';

export const POST = manejadorDeComando(cerrarConteo);

export const runtime = 'nodejs';
