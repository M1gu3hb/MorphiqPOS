import { avisarDeHueco } from '@morphiqpos/app/salon';

import { manejadorDeComandoConParametro } from '~/servidor/ruta';

/**
 * F-409 · Se llamó. Sin la hora del aviso no se puede ordenar por «a quién le
 * toca que le vuelvan a llamar», que es para lo único que sirve haber llamado.
 *
 * El identificador viaja EN LA RUTA y se mete en el cuerpo antes de validar.
 */
export const POST = manejadorDeComandoConParametro(avisarDeHueco, 'esperaId');

export const runtime = 'nodejs';
