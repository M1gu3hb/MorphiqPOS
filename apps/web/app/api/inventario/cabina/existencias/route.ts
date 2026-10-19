import { existenciasDelSalon } from '@morphiqpos/app/salon';

import { manejadorDeComando } from '~/servidor/ruta';

export const POST = manejadorDeComando(existenciasDelSalon);

export const runtime = 'nodejs';
