import { relevarResponsable } from '@morphiqpos/app/restaurante';

import { manejadorDeComando } from '~/servidor/ruta';

export const POST = manejadorDeComando(relevarResponsable);

export const runtime = 'nodejs';
