import { declararAtributo } from '@morphiqpos/app/ferreteria';

import { manejadorDeComando } from '~/servidor/ruta';

/** F-059 · El atributo técnico de la pieza, normalizado.
 *
 * El `05-DATOS-Y-BACKEND.md` §6 la nombra en plural y `catalogo/atributo` ya
 * existía en singular. Las dos apuntan al mismo comando: renombrar la que ya
 * estaba rompería a quien la llame, y un alias de cinco líneas no es deuda. */
export const POST = manejadorDeComando(declararAtributo);

export const runtime = 'nodejs';
