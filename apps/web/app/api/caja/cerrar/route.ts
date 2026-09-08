import { cerrarCaja } from '@morphiqpos/app/caja';

import { manejadorDeComando } from '@/servidor/ruta';

export const POST = manejadorDeComando(cerrarCaja);

export const runtime = 'nodejs';
