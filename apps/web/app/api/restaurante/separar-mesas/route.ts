import { separarMesasComando } from '@morphiqpos/app/restaurante';

import { manejadorDeComando } from '~/servidor/ruta';

export const POST = manejadorDeComando(separarMesasComando);

export const runtime = 'nodejs';
