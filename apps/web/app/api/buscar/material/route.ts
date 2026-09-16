import { buscarMaterial } from '@morphiqpos/app/ferreteria';

import { manejadorDeComando } from '~/servidor/ruta';

/** La ruta más caliente del sistema: buscar una pieza por su medida.
 *
 * NO es el camino del tecleo normal —ése lo resuelve el índice en memoria del
 * cliente—: esto hidrata ese índice al abrir sesión y cubre lo que el índice no
 * alcanza, que en una ferretería grande son 50,000 claves. */
export const POST = manejadorDeComando(buscarMaterial);

export const runtime = 'nodejs';
