import 'server-only';

import { ErrorDominio } from '@morphiqpos/contracts';
import type { Transaccion, repoVentaCatalogo } from '@morphiqpos/data';

import type { EstacionCandidata } from './estaciones.ts';
import { ESTADOS_COMANDA_ACTIVOS, type EstadoComanda, type EstadoMesa } from './transiciones.ts';

/**
 * Las lecturas que comparten los cinco comandos de restaurante.
 *
 * Viven aquí y no en `packages/data` porque son consultas de un caso de uso
 * concreto, no un repositorio: piden exactamente las columnas que la comanda
 * necesita y ni una más (`morphiq-prs §12A` prohíbe `select *` en el camino
 * caliente). El módulo de inventario hace lo mismo con `ctx.tx`.
 */

/**
 * ¿Es este error el índice único que esperábamos que saltara?
 *
 * Sin esta traducción, `ordenes_una_activa_por_mesa` llega al mesero como un
 * 500 sin explicación. El índice hace bien su trabajo —impide antes en vez de
 * limpiar después, que es lo que hoy hace `qrPedidoFlow.js:122-134`— pero un
 * error de Postgres no es un mensaje para una persona.
 *
 * Se comprueba el NOMBRE del índice, no sólo el código 23505: cualquier otra
 * violación de unicidad en la misma transacción significa otra cosa y tiene que
 * seguir subiendo como error interno.
 */
export function esViolacionDeUnicidad(error: unknown, indices: readonly string[]): boolean {
  if (typeof error !== 'object' || error === null) return false;
  if (!('code' in error) || error.code !== '23505') return false;
  if (!('constraint' in error)) return false;
  const nombre = error.constraint;
  return typeof nombre === 'string' && indices.includes(nombre);
}

export interface MesaOperable {
  readonly id: string;
  readonly numero: number;
  readonly estado: EstadoMesa;
  readonly sucursalId: string;
  readonly ordenActivaId: string | null;
  readonly empleadoAtiendeId: string | null;
}

/** La mesa, o `MESA_NO_ENCONTRADA`. Una mesa de otra organización se ve igual. */
export async function mesaOperable(
  tx: Transaccion,
  organizacionId: string,
  mesaId: string,
): Promise<MesaOperable> {
  const fila = await tx
    .selectFrom('mesas')
    .select([
      'id',
      'numero',
      'estado',
      'activa',
      'sucursal_id as sucursalId',
      'orden_activa_id as ordenActivaId',
      'empleado_atiende_id as empleadoAtiendeId',
    ])
    .where('organizacion_id', '=', organizacionId)
    .where('id', '=', mesaId)
    .executeTakeFirst();

  if (fila?.activa !== true) {
    throw new ErrorDominio('MESA_NO_ENCONTRADA', 'Esa mesa no existe o está dada de baja.');
  }

  return {
    id: fila.id,
    numero: fila.numero,
    estado: fila.estado as EstadoMesa,
    sucursalId: fila.sucursalId,
    ordenActivaId: fila.ordenActivaId,
    empleadoAtiendeId: fila.empleadoAtiendeId,
  };
}

export interface OrdenDeMesa {
  readonly id: string;
  readonly estado: string;
  readonly sucursalId: string;
  readonly mesaId: string | null;
  readonly estrategiaCaptura: string;
  readonly codigoCaja: string | null;
  readonly notasAlergias: string | null;
  readonly celebracionEspecial: boolean;
  readonly tipoCelebracion: string | null;
}

export async function ordenDeMesa(
  tx: Transaccion,
  organizacionId: string,
  ordenId: string,
): Promise<OrdenDeMesa> {
  const fila = await tx
    .selectFrom('ordenes')
    .select([
      'id',
      'estado',
      'sucursal_id as sucursalId',
      'mesa_id as mesaId',
      'estrategia_captura as estrategiaCaptura',
      'codigo_caja as codigoCaja',
      'notas_alergias as notasAlergias',
      'celebracion_especial as celebracionEspecial',
      'tipo_celebracion as tipoCelebracion',
    ])
    // El filtro por organización va SIEMPRE, aunque el id sea un uuid: sin él,
    // conocer un id ajeno basta para leer la cuenta de otro negocio (BOLA).
    .where('organizacion_id', '=', organizacionId)
    .where('id', '=', ordenId)
    .executeTakeFirst();

  if (fila === undefined) {
    throw new ErrorDominio('ORDEN_NO_ENCONTRADA', 'Esa cuenta ya no existe.');
  }
  return fila;
}

/** Las estaciones que pueden recibir comandas. Apagada no recibe (regla 10). */
export async function estacionesActivas(
  tx: Transaccion,
  organizacionId: string,
): Promise<readonly EstacionCandidata[]> {
  const filas = await tx
    .selectFrom('estaciones_preparacion')
    .select(['id', 'nombre', 'color', 'es_general as esGeneral'])
    .where('organizacion_id', '=', organizacionId)
    .where('activa', '=', true)
    .orderBy('orden')
    .execute();

  return filas;
}

/**
 * El producto con todo lo que la comanda necesita, en UNA consulta.
 *
 * Extiende el contrato de precio del carril A —para poder pasárselo tal cual a
 * `valorarLinea` y que el precio lo calcule el mismo código que en mostrador—
 * y le añade lo que el restaurante necesita: el área, la estación heredada de
 * la categoría y el insumo base con su nombre para la instantánea del ticket.
 *
 * Una sola consulta con `in` y no una por línea: pedir producto por producto es
 * el N+1 que `morphiq-prs §12A` marca como bloqueante, y una comanda de doce
 * platos son doce viajes dentro de la transacción del pedido.
 */
export interface ProductoDeComanda extends repoVentaCatalogo.ProductoParaVender {
  readonly areaPreparacion: string;
  readonly estacionDeCategoriaId: string | null;
  readonly nombrePorcion: string | null;
  readonly insumoBaseId: string | null;
  readonly insumoBaseNombre: string | null;
}

export async function productosDeComanda(
  tx: Transaccion,
  organizacionId: string,
  productoIds: readonly string[],
): Promise<ReadonlyMap<string, ProductoDeComanda>> {
  if (productoIds.length === 0) return new Map();

  const filas = await tx
    .selectFrom('productos as p')
    .leftJoin('categorias as c', (join) =>
      join
        .onRef('c.id', '=', 'p.categoria_id')
        .onRef('c.organizacion_id', '=', 'p.organizacion_id'),
    )
    // El insumo que ESTE producto es (`insumos.producto_id`), igual que
    // `repoVentaCatalogo.productoParaVender`: un servicio no tiene y se vende igual.
    .leftJoin('insumos as i', (join) =>
      join.onRef('i.producto_id', '=', 'p.id').onRef('i.organizacion_id', '=', 'p.organizacion_id'),
    )
    .leftJoin('insumos as ib', (join) =>
      join
        .onRef('ib.id', '=', 'p.insumo_base_id')
        .onRef('ib.organizacion_id', '=', 'p.organizacion_id'),
    )
    .select([
      'p.id as id',
      'p.nombre as nombre',
      'p.sku as sku',
      'p.codigo_barras as codigoBarras',
      'p.tipo_venta as tipoVenta',
      'p.unidad_venta as unidadVenta',
      'p.precio_venta_centavos as precioVentaCentavos',
      'p.costo_unitario_centavos as costoUnitarioCentavos',
      'p.precio_mayoreo_centavos as precioMayoreoCentavos',
      'p.cantidad_minima_mayoreo as cantidadMinimaMayoreo',
      'p.unidad_variable as unidadVariable',
      'p.precio_por_unidad_variable_centavos as precioPorUnidadVariableCentavos',
      'p.cantidad_minima_variable as cantidadMinimaVariable',
      'p.cantidad_maxima_variable as cantidadMaximaVariable',
      'p.incremento_variable as incrementoVariable',
      'p.capacidad_contenedor_ml as capacidadContenedorMl',
      'p.ml_por_porcion as mlPorPorcion',
      'p.porciones_por_contenedor as porcionesPorContenedor',
      'p.precio_por_porcion_centavos as precioPorPorcionCentavos',
      'p.nombre_porcion as nombrePorcion',
      'p.estrategia_consumo as estrategiaConsumo',
      'p.permite_venta_sin_stock as permiteVentaSinStock',
      'p.area_preparacion as areaPreparacion',
      'c.estacion_preparacion_id as estacionDeCategoriaId',
      'p.insumo_base_id as insumoBaseId',
      'ib.nombre as insumoBaseNombre',
      'i.id as insumoId',
      'i.unidad_base as unidadBaseInsumo',
    ])
    .where('p.organizacion_id', '=', organizacionId)
    .where('p.id', 'in', [...productoIds])
    .where('p.activo', '=', true)
    .execute();

  return new Map(filas.map((fila) => [fila.id, fila]));
}

/**
 * Cuántas comandas de la orden siguen vivas, sin contar las que se acaban de
 * mover en esta misma transacción.
 *
 * Es lo que decide si la mesa avanza: si la barra terminó pero la cocina sigue,
 * la mesa no cambia de estado (`Cocina.jsx:249-259`).
 */
export async function quedanComandasActivas(
  tx: Transaccion,
  organizacionId: string,
  ordenId: string,
  excluir: readonly string[],
): Promise<boolean> {
  let consulta = tx
    .selectFrom('comandas')
    .select('id')
    .where('organizacion_id', '=', organizacionId)
    .where('orden_id', '=', ordenId)
    .where('estado', 'in', [...ESTADOS_COMANDA_ACTIVOS]);

  if (excluir.length > 0) consulta = consulta.where('id', 'not in', [...excluir]);

  return (await consulta.limit(1).executeTakeFirst()) !== undefined;
}

export interface ComandaViva {
  readonly id: string;
  readonly estado: EstadoComanda;
  readonly ordenId: string;
  readonly mesaId: string | null;
  readonly estacionNombre: string | null;
}

export async function comandaPorId(
  tx: Transaccion,
  organizacionId: string,
  comandaId: string,
): Promise<ComandaViva> {
  const fila = await tx
    .selectFrom('comandas')
    .select([
      'id',
      'estado',
      'orden_id as ordenId',
      'mesa_id as mesaId',
      'estacion_nombre as estacionNombre',
    ])
    .where('organizacion_id', '=', organizacionId)
    .where('id', '=', comandaId)
    .executeTakeFirst();

  if (fila === undefined) {
    throw new ErrorDominio('COMANDA_NO_ENCONTRADA', 'Ese pedido ya no está en cocina.');
  }
  return { ...fila, estado: fila.estado as EstadoComanda };
}
