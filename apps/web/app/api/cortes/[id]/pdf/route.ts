import { documentoDeCorte } from '@morphiqpos/app/caja';

import { manejadorDeComandoConParametro } from '~/servidor/ruta';

/**
 * F-259 · El corte en la forma en que se entrega y se archiva.
 *
 * NO devuelve un PDF: devuelve los RENGLONES, y el PDF lo imprime el navegador
 * con la hoja de impresion que ya existe. Un binario armado en el servidor es
 * algo que nadie puede auditar y que hay que regenerar cada vez que cambia una
 * etiqueta; asi el mismo documento se ve, se imprime, se guarda, y cuando
 * alguien lo discute se puede senalar la fila.
 */
export const POST = manejadorDeComandoConParametro(documentoDeCorte, 'corteId');

export const runtime = 'nodejs';
