import { estadoDeCuenta } from '@morphiqpos/app/cartera';

import { manejadorDeComando } from '~/servidor/ruta';

/** F-612 · El estado de cuenta, con el total y lo vencido por separado. */
export const POST = manejadorDeComando(estadoDeCuenta);

export const runtime = 'nodejs';
