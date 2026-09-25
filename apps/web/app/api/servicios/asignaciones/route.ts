import { asignacionesDeServicios } from '@morphiqpos/app/salon';

import { manejadorDeComando } from '~/servidor/ruta';

export const POST = manejadorDeComando(asignacionesDeServicios);

export const runtime = 'nodejs';
