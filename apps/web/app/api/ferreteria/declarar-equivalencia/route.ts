import { declararEquivalenciaDicha } from '@morphiqpos/app/ferreteria';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * F-060 · «No tengo la de 1/2 pero la de 13 mm le sirve», con renglón.
 *
 * La ficha de la pieza publicaba aquí con `{piezaId, texto}` y **esto no
 * existía**: el botón daba el error genérico y la base de equivalencias, que sólo
 * se llena mientras se opera y con el cliente enfrente, no se llenaba nunca.
 *
 * Recibe TEXTO y no un segundo identificador porque la ficha tiene un campo a la
 * vista y no un selector: el comando resuelve lo tecleado contra el catálogo y
 * exige que quede una sola pieza.
 */
export const POST = manejadorDeComando(declararEquivalenciaDicha);

export const runtime = 'nodejs';
