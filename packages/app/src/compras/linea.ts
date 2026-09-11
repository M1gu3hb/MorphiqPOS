import 'server-only';

import { ErrorDominio } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { cantidad, cantidadATexto } from '@morphiqpos/domain/catalogo';
import { desdeTexto } from '@morphiqpos/domain/dinero';
import { sql } from 'kysely';

import type { ContextoComando } from '../definicion.ts';
import {
  cantidadConSigno,
  convertirAUnidadBase,
  costoPorUnidad,
  costoPromedioPonderado,
  equivalenciaDeLinea,
} from './costeo.ts';
import type { LineaDeCompra } from './esquemas.ts';
import { resolverInsumoDeLinea } from './insumos.ts';

/**
 * Los cuatro efectos de UNA línea de compra.
 *
 * La línea en `compra_lineas`, la entrada en el ledger, el incremento de
 * existencias y el costo promedio ponderado del insumo. Los cuatro dentro de la
 * transacción del comando: si esta línea falla, no queda ninguno de los cuatro
 * ni la cabecera que la precedió. Eso es D-12.
 */

export interface DatosDeLinea {
  readonly almacenId: string;
  readonly compraId: string;
  readonly linea: LineaDeCompra;
}

/**
 * Escribe la línea y devuelve el id del insumo que tocó.
 *
 * Lo devuelve porque quien lo llama necesita saber QUÉ insumos se movieron para
 * recalcular sólo los productos que los usan: recalcular la organización entera
 * en cada compra hace que dos compras simultáneas de insumos distintos peleen
 * por las mismas filas de `productos`. Con una línea que crea un insumo nuevo,
 * el id no se conoce hasta aquí.
 */
export async function escribirLinea(
  ctx: ContextoComando<Transaccion>,
  datos: DatosDeLinea,
): Promise<string> {
  const { organizacionId, empleoId } = ctx.ambito;
  const { linea } = datos;

  // Bloquea la fila del insumo: el promedio ponderado se lee y se escribe sobre
  // ella, y dos compras simultáneas del mismo insumo se pisarían.
  const insumo = await resolverInsumoDeLinea(ctx.tx, organizacionId, linea);

  const capturada = cantidad(linea.cantidadCapturada);
  const equivalencia = equivalenciaDeLinea(
    linea.unidadCapturada,
    insumo.unidadBase,
    cantidad(linea.equivalencia),
  );
  const cantidadBase = convertirAUnidadBase(capturada, equivalencia);
  const costoTotal = desdeTexto(linea.costoTotal);

  await ctx.tx
    .insertInto('compra_lineas')
    .values({
      organizacion_id: organizacionId,
      compra_id: datos.compraId,
      insumo_id: insumo.id,
      // Instantánea: el nombre de hoy, para que el histórico sobreviva a un
      // cambio de nombre o a una baja del insumo.
      insumo_nombre: insumo.nombre,
      cantidad_capturada: cantidadATexto(capturada),
      unidad_capturada: linea.unidadCapturada,
      equivalencia: cantidadATexto(equivalencia),
      cantidad: cantidadATexto(cantidadBase),
      costo_total_centavos: costoTotal,
      caduca_el: linea.caducaEl ?? null,
      notas: linea.notas ?? null,
    })
    .execute();

  // Entrada: positiva. Lo impone `movimiento_stock_signo_coherente` (003:366),
  // así que el signo inconsistente de D-10 ya no se puede escribir.
  await ctx.tx
    .insertInto('movimientos_stock')
    .values({
      organizacion_id: organizacionId,
      almacen_id: datos.almacenId,
      insumo_id: insumo.id,
      tipo: 'entrada_compra',
      cantidad: cantidadATexto(cantidadBase),
      unidad: insumo.unidadBase,
      costo_unitario_centavos: costoPorUnidad(costoTotal, cantidadBase),
      referencia_tipo: 'compra',
      referencia_id: datos.compraId,
      empleado_id: empleoId,
      motivo: null,
    })
    .execute();

  // Incremento atómico, nunca sobrescritura: es lo que corrige D-06. El saldo
  // que devuelve es el NUEVO, así que el anterior se deduce restando la entrada
  // en vez de leerlo antes y arriesgar un leer-calcular-escribir.
  const saldo = await sql<{ cantidad: string }>`
    insert into existencias (organizacion_id, almacen_id, insumo_id, cantidad)
    values (${organizacionId}, ${datos.almacenId}, ${insumo.id}, ${cantidadATexto(cantidadBase)})
    on conflict (almacen_id, insumo_id) do update
    set cantidad = existencias.cantidad + excluded.cantidad, actualizado_en = now()
    returning cantidad
  `.execute(ctx.tx);

  const nueva = saldo.rows[0]?.cantidad;
  if (nueva === undefined) {
    throw new ErrorDominio(
      'INVENTARIO_INVALIDO',
      `No se pudo sumar la entrada de «${insumo.nombre}» a la existencia del almacén.`,
    );
  }

  await ctx.tx
    .updateTable('insumos')
    .set({
      costo_unitario_centavos: costoPromedioPonderado({
        existenciaAnterior: cantidadConSigno(nueva) - cantidadBase,
        costoAnteriorCentavos: insumo.costoUnitarioCentavos,
        cantidadEntrante: cantidadBase,
        costoTotalCentavos: costoTotal,
      }),
      unidad_compra_default: linea.unidadCapturada,
      // La equivalencia, no la cantidad comprada. `RegistrarCompraDialog.jsx:301`
      // LEE esta columna como equivalencia y `:365` le escribe la cantidad, así
      // que la siguiente compra en cajas sale con la conversión de la anterior.
      // F1-04 §14.1 la define como equivalencia: se escribe lo que se lee.
      cantidad_por_compra_default: cantidadATexto(equivalencia),
      costo_compra_default_centavos: costoPorUnidad(costoTotal, capturada),
      updated_at: ctx.ahora,
    })
    .where('id', '=', insumo.id)
    .where('organizacion_id', '=', organizacionId)
    .execute();

  return insumo.id;
}

/** Lo que la cabecera acepta. Nunca el total: ése sale de las líneas. */
export interface CabeceraDeCompra {
  readonly proveedorId?: string | undefined;
  readonly proveedorNombre?: string | undefined;
  readonly fecha?: string | undefined;
  readonly metodoPago?: string | undefined;
  readonly facturaFolio?: string | undefined;
  readonly notas?: string | undefined;
}

export interface ProveedorDeCompra {
  readonly id: string | null;
  readonly nombre: string;
}

/**
 * El proveedor y su instantánea.
 *
 * `proveedor_nombre` es `not null` y se copia al comprar: es lo que permite
 * desactivar un proveedor sin romper el histórico (F1-04 §24).
 */
export async function resolverProveedor(
  tx: Transaccion,
  organizacionId: string,
  cabecera: CabeceraDeCompra,
): Promise<ProveedorDeCompra> {
  if (cabecera.proveedorId === undefined) {
    return { id: null, nombre: cabecera.proveedorNombre ?? 'Compra directa' };
  }

  const fila = await tx
    .selectFrom('proveedores')
    .select(['id', 'nombre', 'activo'])
    .where('id', '=', cabecera.proveedorId)
    .where('organizacion_id', '=', organizacionId)
    .executeTakeFirst();

  if (fila === undefined) {
    throw new ErrorDominio('PROVEEDOR_NO_ENCONTRADO', 'Ese proveedor ya no está en el catálogo.');
  }
  if (!fila.activo) {
    throw new ErrorDominio(
      'PROVEEDOR_NO_ENCONTRADO',
      `«${fila.nombre}» está desactivado. Reactívalo o registra la compra como compra directa.`,
    );
  }
  return { id: fila.id, nombre: fila.nombre };
}
