import { conteoPorPeso } from '@morphiqpos/app/ferreteria';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * F-151 · Contar pesando, que NO es contar.
 *
 * Devuelve el numero con su rango de confianza y una marca de si es fiable. Un
 * conteo por bascula presentado como exacto entra al kardex como si alguien
 * hubiera contado pieza por pieza, y a partir de ahi nadie puede distinguir un
 * faltante real de la tolerancia de la balanza.
 */
export const POST = manejadorDeComando(conteoPorPeso);

export const runtime = 'nodejs';
