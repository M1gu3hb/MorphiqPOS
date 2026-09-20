import { crearNotaMostrador } from '@morphiqpos/app/ferreteria';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * «Mandar a caja · F12» del mostrador de una ferretería.
 *
 * La pantalla publicaba en `/api/venta/nota-mostrador`, que sirve a `apartarNota`
 * —«déjamelo apartado», F-140— y pide `{notaId, apartaHasta}`: mandaba
 * `{clienteId, partidas}` y recibía «Hay datos incompletos o mal escritos». La
 * nota del pasillo nunca llegaba a la caja, así que una ferretería no podía
 * vender por su pantalla.
 *
 * La ruta es nueva y NO sustituye a la de apartar: son dos cosas distintas y las
 * dos existen. `ferreteria.crear_nota_mostrador` explica por qué la nota no puede
 * ser el carrito.
 */
export const POST = manejadorDeComando(crearNotaMostrador);

export const runtime = 'nodejs';
