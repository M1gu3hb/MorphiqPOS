import { registrarServicio } from '@morphiqpos/app/ferreteria';

import { manejadorDeComando } from '~/servidor/ruta';

/** F-141 · El trabajo de mostrador: lo que se cobra sin salir del inventario. */
export const POST = manejadorDeComando(registrarServicio);

export const runtime = 'nodejs';
