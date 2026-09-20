import { tiemposDePreparacion } from '@morphiqpos/app/restaurante';

import { manejadorDeComando } from '~/servidor/ruta';

export const POST = manejadorDeComando(tiemposDePreparacion);

export const runtime = 'nodejs';
