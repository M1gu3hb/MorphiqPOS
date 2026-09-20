import { entregarNota } from '@morphiqpos/app/ferreteria';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * F-142 · Entregar la nota, sellando la hora. «¿Cuándo se llevó esto?» es la
 * primera pregunta cuando el cliente dice que no le dieron todo.
 */
export const POST = manejadorDeComando(entregarNota);

export const runtime = 'nodejs';
