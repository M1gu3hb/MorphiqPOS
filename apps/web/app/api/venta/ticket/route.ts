import { ticketDeOrden } from '@morphiqpos/app/venta';

import { manejadorDeComando } from '@/servidor/ruta';

export const POST = manejadorDeComando(ticketDeOrden);

export const runtime = 'nodejs';
