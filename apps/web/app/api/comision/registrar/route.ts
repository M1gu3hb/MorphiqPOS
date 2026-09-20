import { registrarComision } from '@morphiqpos/app/abarrotes';

import { manejadorDeComando } from '~/servidor/ruta';

export const POST = manejadorDeComando(registrarComision);

export const runtime = 'nodejs';
