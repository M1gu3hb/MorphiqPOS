import { cambiarCantidad } from '@morphiqpos/app/venta';

import { manejadorDeComando } from '@/servidor/ruta';

export const POST = manejadorDeComando(cambiarCantidad);

export const runtime = 'nodejs';
