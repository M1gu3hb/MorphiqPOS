import { recibirTraspaso } from '@morphiqpos/app/inventario';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * F-105 · La segunda mitad: entra al destino lo que DE VERDAD llegó.
 *
 * Ruta aparte porque entre una y otra pasa el camión. Una sola obligaría a
 * registrar el traspaso cuando ya llegó, y entonces lo que está en tránsito no
 * existe en ningún almacén durante horas.
 */
export const POST = manejadorDeComando(recibirTraspaso);

export const runtime = 'nodejs';
