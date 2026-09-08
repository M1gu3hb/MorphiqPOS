import { abrirCaja } from '@morphiqpos/app/caja';

import { manejadorDeComando } from '@/servidor/ruta';

export const POST = manejadorDeComando(abrirCaja);

export const runtime = 'nodejs';
