import { alcanzaLaCabina } from '@morphiqpos/app/salon';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * F-155 · Si la cabina alcanza para lo que YA esta agendado. Preguntarlo
 * contra el consumo de ayer es enterarse el sabado de que el tinte rubio no
 * alcanza para las cuatro citas del sabado.
 */
export const POST = manejadorDeComando(alcanzaLaCabina);

export const runtime = 'nodejs';
