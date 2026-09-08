import 'server-only';

import type { Kysely } from 'kysely';

import type { Transaccion } from '../../cliente.ts';
import type { Esquema } from '../../esquema.ts';

/**
 * La orden y sus líneas (F1.1-A-06).
 *
 * **El carrito ES la orden en borrador.** Corrige P1-10: en la fuente el
 * carrito vivía en memoria del navegador y se convertía en venta al final, así
 * que un fallo a media venta hacía que el cajero reintentara desde cero y
 * acabara duplicando. Aquí cada línea se persiste al agregarse; recargar la
 * pestaña recupera el carrito, y sólo puede haber un borrador por terminal
 * (`ordenes_borrador_por_terminal`).
 */

export interface OrdenBorrador {
  readonly id: string;
  readonly estado: string;
  readonly version: number;
  readonly sucursalId: string;
  readonly sesionCajaId: string | null;
}

export interface LineaDeOrden {
  readonly id: string;
  readonly productoId: string | null;
  readonly productoNombre: string;
  readonly sku: string | null;
  readonly cantidad: string;
  readonly unidad: string;
  readonly precioUnitarioCentavos: bigint;
  readonly costoUnitarioCentavos: bigint;
  readonly descuentoCentavos: bigint;
  readonly subtotalCentavos: bigint;
  readonly totalCentavos: bigint;
  readonly esMayoreo: boolean;
  readonly tipoVenta: string;
  readonly ordenVisual: number;
}

/** El borrador vivo de una terminal, si lo hay. */
export async function borradorDeTerminal(
  db: Kysely<Esquema>,
  organizacionId: string,
  terminalId: string,
): Promise<OrdenBorrador | null> {
  const fila = await db
    .selectFrom('ordenes')
    .select([
      'id',
      'estado',
      'version',
      'sucursal_id as sucursalId',
      'sesion_caja_id as sesionCajaId',
    ])
    .where('organizacion_id', '=', organizacionId)
    .where('terminal_id', '=', terminalId)
    .where('estado', '=', 'borrador')
    .executeTakeFirst();

  return fila ?? null;
}

export async function ordenPorId(
  db: Kysely<Esquema>,
  organizacionId: string,
  ordenId: string,
): Promise<OrdenBorrador | null> {
  const fila = await db
    .selectFrom('ordenes')
    .select([
      'id',
      'estado',
      'version',
      'sucursal_id as sucursalId',
      'sesion_caja_id as sesionCajaId',
    ])
    // El filtro por organización va SIEMPRE, aunque el id sea un uuid: sin él,
    // conocer un id de otra organización basta para leer su orden (BOLA).
    .where('organizacion_id', '=', organizacionId)
    .where('id', '=', ordenId)
    .executeTakeFirst();

  return fila ?? null;
}

export async function lineasDeOrden(
  db: Kysely<Esquema> | Transaccion,
  organizacionId: string,
  ordenId: string,
): Promise<LineaDeOrden[]> {
  return db
    .selectFrom('orden_lineas')
    .select([
      'id',
      'producto_id as productoId',
      'producto_nombre as productoNombre',
      'sku',
      'cantidad',
      'unidad',
      'precio_unitario_centavos as precioUnitarioCentavos',
      'costo_unitario_centavos as costoUnitarioCentavos',
      'descuento_centavos as descuentoCentavos',
      'subtotal_centavos as subtotalCentavos',
      'total_centavos as totalCentavos',
      'es_mayoreo as esMayoreo',
      'tipo_venta as tipoVenta',
      'orden_visual as ordenVisual',
    ])
    .where('organizacion_id', '=', organizacionId)
    .where('orden_id', '=', ordenId)
    .orderBy('orden_visual')
    .execute();
}

export interface NuevaOrden {
  readonly organizacionId: string;
  readonly sucursalId: string;
  readonly terminalId: string | null;
  readonly empleadoAtiendeId: string;
  readonly sesionCajaId: string | null;
}

export async function crearBorrador(tx: Transaccion, datos: NuevaOrden): Promise<string> {
  const fila = await tx
    .insertInto('ordenes')
    .values({
      organizacion_id: datos.organizacionId,
      sucursal_id: datos.sucursalId,
      terminal_id: datos.terminalId,
      sesion_caja_id: datos.sesionCajaId,
      empleado_atiende_id: datos.empleadoAtiendeId,
      estado: 'borrador',
      estrategia_captura: 'mostrador',
      estrategia_cumplimiento: 'inmediato',
    })
    .returning('id')
    .executeTakeFirstOrThrow();

  return fila.id;
}

export interface NuevaLinea {
  readonly organizacionId: string;
  readonly ordenId: string;
  readonly productoId: string;
  readonly productoNombre: string;
  readonly sku: string | null;
  readonly codigoBarras: string | null;
  readonly cantidad: string;
  readonly unidad: string;
  readonly precioUnitarioCentavos: bigint;
  readonly costoUnitarioCentavos: bigint;
  readonly subtotalCentavos: bigint;
  readonly totalCentavos: bigint;
  readonly esMayoreo: boolean;
  readonly tipoVenta: string;
  readonly ordenVisual: number;
}

export async function agregarLinea(tx: Transaccion, linea: NuevaLinea): Promise<string> {
  const fila = await tx
    .insertInto('orden_lineas')
    .values({
      organizacion_id: linea.organizacionId,
      orden_id: linea.ordenId,
      producto_id: linea.productoId,
      producto_nombre: linea.productoNombre,
      sku: linea.sku,
      codigo_barras: linea.codigoBarras,
      cantidad: linea.cantidad,
      unidad: linea.unidad,
      precio_unitario_centavos: linea.precioUnitarioCentavos,
      costo_unitario_centavos: linea.costoUnitarioCentavos,
      subtotal_centavos: linea.subtotalCentavos,
      total_centavos: linea.totalCentavos,
      es_mayoreo: linea.esMayoreo,
      tipo_venta: linea.tipoVenta,
      orden_visual: linea.ordenVisual,
    })
    .returning('id')
    .executeTakeFirstOrThrow();

  return fila.id;
}

/** Devuelve cuántas filas borró: cero significa «no era de esta organización». */
export async function quitarLinea(
  tx: Transaccion,
  organizacionId: string,
  ordenId: string,
  lineaId: string,
): Promise<number> {
  const resultado = await tx
    .deleteFrom('orden_lineas')
    .where('organizacion_id', '=', organizacionId)
    .where('orden_id', '=', ordenId)
    .where('id', '=', lineaId)
    .executeTakeFirst();

  return Number(resultado.numDeletedRows);
}

export async function actualizarImportesDeLinea(
  tx: Transaccion,
  organizacionId: string,
  lineaId: string,
  datos: {
    readonly cantidad: string;
    readonly subtotalCentavos: bigint;
    readonly totalCentavos: bigint;
    readonly precioUnitarioCentavos: bigint;
    readonly esMayoreo: boolean;
  },
): Promise<number> {
  const resultado = await tx
    .updateTable('orden_lineas')
    .set({
      cantidad: datos.cantidad,
      subtotal_centavos: datos.subtotalCentavos,
      total_centavos: datos.totalCentavos,
      precio_unitario_centavos: datos.precioUnitarioCentavos,
      es_mayoreo: datos.esMayoreo,
    })
    .where('organizacion_id', '=', organizacionId)
    .where('id', '=', lineaId)
    .executeTakeFirst();

  return Number(resultado.numUpdatedRows);
}

/** El número visual siguiente. Se calcula en SQL para no traer las líneas. */
export async function siguienteOrdenVisual(
  tx: Transaccion,
  organizacionId: string,
  ordenId: string,
): Promise<number> {
  const fila = await tx
    .selectFrom('orden_lineas')
    .select((eb) => eb.fn.max('orden_visual').as('maximo'))
    .where('organizacion_id', '=', organizacionId)
    .where('orden_id', '=', ordenId)
    .executeTakeFirst();

  return (fila?.maximo ?? 0) + 1;
}
