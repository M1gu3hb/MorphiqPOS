import { versionarCotizacion } from '@morphiqpos/app/ferreteria';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * F-601 · La vuelta siguiente CREA una version nueva y apaga la anterior. La
 * que el cliente aprobo tiene que seguir existiendo el dia de la entrega.
 */
export const POST = manejadorDeComando(versionarCotizacion);

export const runtime = 'nodejs';
