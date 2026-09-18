import { declararEquivalencia } from '@morphiqpos/app/ferreteria';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * F-060 · «No tengo la de 1/2 pero la de 13 mm le sirve».
 *
 * Hoy eso vive en la cabeza de una persona, y cuando se va la venta se cae sin
 * quedar registrada en ningun sitio. Por eso se declara QUIEN lo dijo: no es
 * auditoria, es producto.
 *
 * El sustituto va y viene; el complemento no. El teflon va con la llave, pero
 * ofrecer una llave a quien pide teflon es ruido en el mostrador.
 */
export const POST = manejadorDeComando(declararEquivalencia);

export const runtime = 'nodejs';
