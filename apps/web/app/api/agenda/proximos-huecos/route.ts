import { proximosHuecos } from '@morphiqpos/app/salon';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * Lo que alimenta el boton AGENDAR: los seis proximos huecos que caben en una
 * pantalla sin desplazar.
 *
 * Desde AHORA y no desde hoy a las cero: ofrecer las nueve de la manana a las
 * once es como se agenda una cita que ya paso.
 */
export const POST = manejadorDeComando(proximosHuecos);

export const runtime = 'nodejs';
