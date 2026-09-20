import { asignarFiscalMasivo } from '@morphiqpos/app/catalogo';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * F-012 · El IVA y el IEPS no son del producto: son de la CATEGORIA.
 *
 * Ponerlos clave por clave en un catalogo de 2,000 son tres tardes, asi que no
 * se ponen: todo queda al 16 % por omision y el error no aparece en ninguna
 * pantalla hasta la declaracion.
 *
 * Por omision NO aplica: dice que cambiaria y en cuantos. Marcar cuatrocientas
 * claves como cerveza por elegir mal la categoria se descubre en la declaracion,
 * y para entonces ya se vendieron.
 */
export const POST = manejadorDeComando(asignarFiscalMasivo);

export const runtime = 'nodejs';
