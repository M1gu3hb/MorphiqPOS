import { agendarWalkIn } from '@morphiqpos/app/salon';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * F-402 · La que entra sin avisar. Es la MISMA cita, no otra cosa: delega en
 * `agendarCita` con origen `walk_in` y la hora del servidor.
 *
 * Un segundo camino para ocupar a alguien tendria su propia comprobacion de
 * choques -o no la tendria-, y la ocupacion real del salon acabaria repartida
 * entre dos aritmeticas que no coinciden.
 */
export const POST = manejadorDeComando(agendarWalkIn);

export const runtime = 'nodejs';
