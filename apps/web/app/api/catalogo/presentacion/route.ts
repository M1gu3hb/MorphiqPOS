import { crearPresentacion } from '@morphiqpos/app/abarrotes';

import { manejadorDeComando } from '~/servidor/ruta';

export const POST = manejadorDeComando(crearPresentacion);

export const runtime = 'nodejs';
