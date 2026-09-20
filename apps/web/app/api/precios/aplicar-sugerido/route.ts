import { aplicarPrecioSugerido } from '@morphiqpos/app/catalogo';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * El precio que sube cuando sube el costo (F-16x).
 *
 * La pantalla de entradas publicaba aquí y **esto no existía**: el aviso de «este
 * material subió de costo, el precio sugerido es X» se veía y no se podía
 * obedecer. En cable y cobre eso es el mostrador vendiendo a pérdida toda la
 * semana sin enterarse.
 *
 * No es `/api/catalogo/productos/precio`: ese comando reescribe el bloque de
 * precios entero y exige mayoreo, variable y porción juntos. Éste toca una
 * columna, que es lo que significa «aceptar la sugerencia».
 */
export const POST = manejadorDeComando(aplicarPrecioSugerido);

export const runtime = 'nodejs';
