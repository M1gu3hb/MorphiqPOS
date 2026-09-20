import { cortarYAgregar } from '@morphiqpos/app/ferreteria';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * F-145 y F-150 · CORTAR Y AGREGAR, la ruta que la pantalla llamaba.
 *
 * `ferreteria/CorteDeMaterial.tsx` publicaba aquí desde el primer día y **esto no
 * existía**: el botón de la función más propia de una ferretería contestaba 404.
 *
 * No es la misma que `/api/inventario/cortar`, y las dos se quedan:
 *
 * - `/api/inventario/cortar` sirve a `inventario.cortar_material`, que corta
 *   contra una PARTIDA QUE YA EXISTE y habla en unidad base. Es la puerta de
 *   quien ya tiene una venta abierta.
 * - ésta sirve a `ferreteria.cortar_y_agregar`, que es la pantalla: abre la nota,
 *   le cuelga la partida y corta, en una sola transacción, hablando en metros con
 *   decimales como la persona que teclea.
 */
export const POST = manejadorDeComando(cortarYAgregar);

export const runtime = 'nodejs';
