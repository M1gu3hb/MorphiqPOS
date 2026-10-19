import { fijarLimiteDeCredito } from '@morphiqpos/app/cartera';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * El límite de crédito de un cliente (C.10 de la 2.4).
 *
 * `clientes.limite_credito_centavos` lo leían la cartera, el mostrador y el muro, y
 * ningún comando lo escribía: todo cliente nacía «sin definir». Lo fija el dueño o el
 * administrador, con motivo, y queda en la bitácora con el de antes.
 */
export const POST = manejadorDeComando(fijarLimiteDeCredito);

export const runtime = 'nodejs';
