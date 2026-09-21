import { piezasDeProducto } from '@morphiqpos/app/ferreteria';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * Las piezas ABIERTAS de un material, y cuál conviene cortar.
 *
 * ── Por qué esta ruta no existía, y qué rompía ─────────────────────────────
 * `inventario.piezas_abiertas` está escrito desde F-150 —devuelve las piezas
 * vivas y RECOMIENDA la más chica que alcance, que es la regla que hace que una
 * ferretería se acabe los rollos abiertos en vez de abrir otro— y **no tenía
 * ruta**. La pantalla de material preguntaba en `/api/inventario/pieza-abierta`,
 * que es el comando de ABRIR: contestaba 400 y la pantalla mostraba «No hay
 * ninguna abierta» con los rollos abiertos en la base.
 *
 * Es una LECTURA y va por `manejadorDeComando` igual que las otras consultas de
 * comando: `escribe: false` y su gate de rol propio.
 */
export const POST = manejadorDeComando(piezasDeProducto);

export const runtime = 'nodejs';
