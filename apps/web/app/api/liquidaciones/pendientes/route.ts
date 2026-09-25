import { pendientesPorProfesional } from '@morphiqpos/app/salon';

import { manejadorDeComando } from '~/servidor/ruta';

export const POST = manejadorDeComando(pendientesPorProfesional);

export const runtime = 'nodejs';
