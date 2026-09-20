import { guardarFotoDeMostrador } from '@morphiqpos/app/ferreteria';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * F-061 · La foto que toma el mostradorista, que NO es la del catalogo. Su
 * valor esta en la ubicacion que la acompaña: un mostradorista nuevo tarda seis
 * meses en aprender donde esta cada cosa, y con la foto del anaquel, dos
 * semanas.
 */
export const POST = manejadorDeComando(guardarFotoDeMostrador);

export const runtime = 'nodejs';
