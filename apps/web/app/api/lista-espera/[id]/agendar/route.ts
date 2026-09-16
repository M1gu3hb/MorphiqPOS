import { agendarDesdeEspera } from '@morphiqpos/app/salon';

import { manejadorDeComandoConParametro } from '~/servidor/ruta';

/**
 * F-409 · La espera se convierte en cita. Avisar y agendar son dos pasos
 * porque entre uno y otro pasa la vida real: no contesta, lo piensa, dice que
 * sí y luego no puede.
 *
 * El identificador viaja EN LA RUTA y se mete en el cuerpo antes de validar.
 */
export const POST = manejadorDeComandoConParametro(agendarDesdeEspera, 'esperaId');

export const runtime = 'nodejs';
