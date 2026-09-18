import { anularLineaComando } from '@morphiqpos/app/restaurante';

import { manejadorDeComando } from '~/servidor/ruta';

export const POST = manejadorDeComando(anularLineaComando);

export const runtime = 'nodejs';
