import { programaDeSellos } from '@morphiqpos/app/cafeteria';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * El programa de sellos en sus tres cifras: el pasivo, a un sello del premio y quién no viene
 * hace 21 días. Ver `cafeteria/programa.ts`.
 */
export const POST = manejadorDeComando(programaDeSellos);

export const runtime = 'nodejs';
