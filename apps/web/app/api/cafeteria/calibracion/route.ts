import { registrarCalibracion } from '@morphiqpos/app/cafeteria';

import { manejadorDeComando } from '~/servidor/ruta';

export const POST = manejadorDeComando(registrarCalibracion);

export const runtime = 'nodejs';
