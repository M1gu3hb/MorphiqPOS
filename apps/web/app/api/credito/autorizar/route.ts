import { autorizarVentaACredito } from '@morphiqpos/app/ferreteria';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * La llave del dueno, y SIEMPRE tiene que existir.
 *
 * Un muro sin llave se apaga el primer viernes en que el contratista de siempre
 * llega por $40,000 de varilla con tres dias de retraso: no se discute el muro,
 * se desactiva el modulo entero. Por eso la llave se REGISTRA -quien, para
 * quien, por cuanto y por que-, vale por un importe y caduca. Si el mismo
 * cliente lleva nueve autorizaciones en dos meses, el muro no esta fallando.
 */
export const POST = manejadorDeComando(autorizarVentaACredito);

export const runtime = 'nodejs';
