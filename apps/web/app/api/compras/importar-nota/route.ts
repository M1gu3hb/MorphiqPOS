import { importarNotaDeProveedor } from '@morphiqpos/app/compras';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * F-631 · La nota de cuarenta a doscientos renglones, sin teclearla.
 *
 * PROPONE y no aplica: emparejar automaticamente doscientos renglones por
 * nombre es meter material en claves equivocadas a una escala que despues nadie
 * desenreda. Devuelve por que caso cada uno -clave, codigo o nombre- y marca
 * como dudoso solo el camino que se equivoca.
 */
export const POST = manejadorDeComando(importarNotaDeProveedor);

export const runtime = 'nodejs';
