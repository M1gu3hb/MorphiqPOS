import { listaDeProfesionales } from '@morphiqpos/app/salon';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * F-420 · Quien atiende. Marca a quien RENTA la estacion: no cobra comision,
 * paga renta, y presentarla igual que a una empleada haria que el salon le
 * calculara una nomina que no existe.
 */
export const POST = manejadorDeComando(listaDeProfesionales);

export const runtime = 'nodejs';
