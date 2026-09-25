import { cancelarEspera } from '@morphiqpos/app/salon';

import { manejadorDeComandoConParametro } from '~/servidor/ruta';

export const POST = manejadorDeComandoConParametro(cancelarEspera, 'esperaId');

export const runtime = 'nodejs';
