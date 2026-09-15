import { registrarAbonoFiado } from '@morphiqpos/app/abarrotes';

import { manejadorDeComando } from '~/servidor/ruta';

export const POST = manejadorDeComando(registrarAbonoFiado);

export const runtime = 'nodejs';
