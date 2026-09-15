import { emitirDocumentoCredito } from '@morphiqpos/app/cartera';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * F-610 y F-611 · Fiar, con su límite y su plazo.
 *
 * La ruta se llama «límite» porque es lo que la pantalla de abarrotes enseña al
 * fiar: cuánto le queda disponible. Lo que hace el comando es EMITIR el
 * documento, y comprobar el crédito en el único momento en que se puede decir
 * que no — después ya salió la mercancía.
 */
export const POST = manejadorDeComando(emitirDocumentoCredito);

export const runtime = 'nodejs';
