import { huecosDisponibles } from '@morphiqpos/app/salon';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * F-404 + F-415 · El endpoint mas dificil del modelo.
 *
 * Descuenta bloqueos, respeta el horario vigente del profesional y ofrece los
 * tramos PASIVOS de otras citas como espacio utilizable: ese ultimo renglon es
 * el 25 %-40 % de capacidad que ningun competidor del segmento aprovecha.
 */
export const POST = manejadorDeComando(huecosDisponibles);

export const runtime = 'nodejs';
