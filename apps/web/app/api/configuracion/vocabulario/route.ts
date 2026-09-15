import { fijarTermino } from '@morphiqpos/app/configuracion';

import { manejadorDeComando } from '~/servidor/ruta';

/** F-017 · Cómo llama este negocio a una entidad: singular, plural y género. */
export const POST = manejadorDeComando(fijarTermino);

export const runtime = 'nodejs';
