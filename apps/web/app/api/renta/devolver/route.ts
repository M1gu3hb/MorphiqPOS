import { devolverRenta } from '@morphiqpos/app/ferreteria';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * F-147 · La herramienta que vuelve, y el deposito que se liquida.
 *
 * `renta/route.ts` sacaba la herramienta y nada la devolvia. Un deposito que
 * entra y no sale es dinero del cliente parado en el cajon, y el descuadre no se
 * ve el dia de la renta: se ve el dia que el cliente lo reclama.
 */
export const POST = manejadorDeComando(devolverRenta);

export const runtime = 'nodejs';
