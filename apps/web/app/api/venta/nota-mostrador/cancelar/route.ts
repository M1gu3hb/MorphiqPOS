import { cancelarNota } from '@morphiqpos/app/ferreteria';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * `02-DINERO-Y-CAJA §8.5.1` · Cancelar la nota que nadie vino a pagar, con su motivo: se
 * cobra o se cancela, y el material vuelve a estar disponible.
 */
export const POST = manejadorDeComando(cancelarNota);

export const runtime = 'nodejs';
