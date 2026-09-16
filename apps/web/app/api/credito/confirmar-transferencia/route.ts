import { confirmarTransferencia } from '@morphiqpos/app/cartera';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * F-212 · La transferencia no baja el saldo hasta que alguien ve el banco.
 *
 * Son el 20 %-35 % del valor en una ferreteria y llegan con un comprobante que
 * se ve en la pantalla del cliente. El sistema no puede saber si es real: lo
 * unico que puede hacer es no creerselo todavia. Aplicarla al registrarse es
 * como un comprobante falso de $12,000 sale por la puerta convertido en
 * material.
 *
 * Y lo confirma OTRA persona, en otro momento: el dueno abre el banco el lunes
 * y va marcando. Meterlo en el cobro pondria la decision en manos de quien
 * tiene al cliente enfrente, que es justo quien no puede tomarla.
 */
export const POST = manejadorDeComando(confirmarTransferencia);

export const runtime = 'nodejs';
