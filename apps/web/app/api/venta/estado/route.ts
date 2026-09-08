import { estadoDeVenta } from '@morphiqpos/app/venta';

import { manejadorDeComando } from '@/servidor/ruta';

export const POST = manejadorDeComando(estadoDeVenta);

export const runtime = 'nodejs';
