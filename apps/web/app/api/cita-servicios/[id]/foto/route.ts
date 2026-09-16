import { guardarFotoDeServicio } from '@morphiqpos/app/salon';

import { manejadorDeComandoConParametro } from '~/servidor/ruta';

/**
 * F-436 · El antes y el despues, dentro del expediente.
 *
 * Una foto por momento y por servicio: si ya habia una se reemplaza Y EL
 * RESULTADO LO DICE. La segunda «antes» tapando a la primera en silencio deja
 * a nadie sabiendo cual era la buena.
 *
 * Y se busca el consentimiento vigente: la foto sin el se guarda igual -negarla
 * haria que el salon dejara de documentar- pero queda marcada como lo que es.
 */
export const POST = manejadorDeComandoConParametro(guardarFotoDeServicio, 'citaServicioId');

export const runtime = 'nodejs';
