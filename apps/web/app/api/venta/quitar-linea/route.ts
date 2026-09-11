import { quitarLinea } from '@morphiqpos/app/venta';

import { manejadorDeComando } from '@/servidor/ruta';

export const POST = manejadorDeComando(quitarLinea);

export const runtime = 'nodejs';
