import { asignarUbicacion } from '@morphiqpos/app/ferreteria';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * F-152 · Donde esta la pieza. NO es la zona de anaquel: la zona existe para
 * CONTAR, una vez al dia, por el encargado; la ubicacion existe para VENDER,
 * sesenta veces al dia, por el mostradorista.
 *
 * La gaveta se reutiliza en vez de duplicarse: crear una fila por producto
 * llenaria la tabla de «pasillo 3 gaveta 12» repetido cuarenta veces, y cambiar
 * el orden de recorrido habria que hacerlo cuarenta veces tambien.
 */
export const POST = manejadorDeComando(asignarUbicacion);

export const runtime = 'nodejs';
