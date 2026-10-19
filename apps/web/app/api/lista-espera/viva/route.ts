import { listaDeEspera } from '@morphiqpos/app/salon';

import { manejadorDeComando } from '~/servidor/ruta';

export const POST = manejadorDeComando(listaDeEspera);

export const runtime = 'nodejs';
