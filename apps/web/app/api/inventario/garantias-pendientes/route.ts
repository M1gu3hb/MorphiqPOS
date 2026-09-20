import { garantiasPendientes } from '@morphiqpos/app/ferreteria';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * F-146 · Lo que está en el limbo: mandado al proveedor y sin respuesta.
 *
 * ── Por qué esta ruta tenía que existir ───────────────────────────────────
 * El comando `inventario.garantias_pendientes` estaba escrito, probado y
 * exportado, y no tenía ruta: era código inalcanzable. `trabajos-de-mostrador`
 * pedía la lista por POST a `/api/inventario/garantia` —la de ESCRITURA, que pide
 * la pieza y el proveedor— con `{listar: true}`, así que recibía 400 y su `.catch`
 * lo convertía en «no hay garantías pendientes» con las garantías en la base.
 *
 * Es de LECTURA: `escribe: false`, y por eso no toma clave de idempotencia ni
 * escribe auditoría. Sigue siendo POST porque el filtro va en el cuerpo, igual que
 * el puente.
 */
export const POST = manejadorDeComando(garantiasPendientes);

export const runtime = 'nodejs';
