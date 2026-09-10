import 'server-only';

import { ErrorDominio } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import type { z } from 'zod';

import { valorarLinea, type LineaValorada } from '../venta/valorar.ts';
import type { ProductoDeComanda } from './datos.ts';
import type { EstacionResuelta } from './estaciones.ts';
import type { entradaEnviarPedido } from './esquemas.ts';

/**
 * De lo que el mesero capturó a la línea de venta con sus instantáneas.
 *
 * El precio lo pone `valorarLinea`, que es EL MISMO código que valora una línea
 * de mostrador (`packages/app/src/venta/valorar.ts`). Tener dos sitios donde se
 * calcula un precio es la señal 4 de desviación arquitectónica de
 * `04-ARQUITECTURA §9`, y en un restaurante significa que la comanda y el
 * ticket dicen cosas distintas.
 *
 * Las instantáneas son el contrato de trazabilidad de `F1-01` §3.11: un ticket
 * de hace seis meses tiene que seguir imprimiéndose aunque el producto haya
 * cambiado de precio, se haya renombrado o haya desaparecido del catálogo.
 */

type EntradaPedido = z.infer<typeof entradaEnviarPedido>;
type LineaCapturada = EntradaPedido['lineas'][number];

export interface LineaPreparada {
  /** Se genera aquí para que la comanda pueda apuntar a la línea sin releerla. */
  readonly id: string;
  readonly producto: ProductoDeComanda;
  readonly valorada: LineaValorada;
  readonly estacion: EstacionResuelta;
  readonly areaPreparacion: string;
  readonly notas: string | null;
  readonly ordenVisual: number;
}

/**
 * Valora una línea capturada contra el catálogo.
 *
 * Si el producto no está —archivado, borrado, de otra organización— falla. Un
 * producto de otra organización responde igual que uno inexistente:
 * distinguirlos permitiría sondear el catálogo ajeno con ids.
 */
export function prepararLinea(
  capturada: LineaCapturada,
  producto: ProductoDeComanda,
  estacion: EstacionResuelta,
  ordenVisual: number,
): LineaPreparada {
  return {
    id: crypto.randomUUID(),
    producto,
    valorada: valorarLinea(producto, capturada.cantidad, unidadDeCaptura(capturada, producto)),
    estacion,
    areaPreparacion: producto.areaPreparacion,
    notas: capturada.notas === undefined || capturada.notas === '' ? null : capturada.notas,
    ordenVisual,
  };
}

/**
 * La unidad con la que se captura cada tipo de venta.
 *
 * Se decide aquí y no se deja al valor por omisión de `valorar.ts`, que para
 * `porcion_contenedor` devuelve `'ml'` y hace fallar `precioDeLinea` con
 * «Captura un número entero de porciones» (`precio.ts:31-35`). Es un defecto de
 * ese archivo, ajeno a este módulo; aquí simplemente no se pisa esa mina.
 */
function unidadDeCaptura(capturada: LineaCapturada, producto: ProductoDeComanda): string {
  if (capturada.unidad !== undefined && capturada.unidad !== '') return capturada.unidad;
  if (producto.tipoVenta === 'porcion_contenedor') return 'porcion';
  if (producto.tipoVenta === 'variable_medida') return producto.unidadVariable ?? 'kg';
  return producto.unidadVenta;
}

/**
 * Escribe TODAS las líneas en una sola sentencia.
 *
 * Una sola, y con ids ya generados, por dos razones. La primera es que una
 * comanda de doce platos no se puede permitir doce viajes dentro de la
 * transacción. La segunda es que los ids tienen que existir ANTES de insertar
 * los `comanda_items`, que apuntan a ellos con `orden_linea_id` — y depender del
 * orden en que Postgres devuelve un `returning` sería depender de algo que
 * nadie promete.
 */
export async function insertarLineas(
  tx: Transaccion,
  organizacionId: string,
  ordenId: string,
  lineas: readonly LineaPreparada[],
): Promise<void> {
  await tx
    .insertInto('orden_lineas')
    .values(lineas.map((linea) => filaDeLinea(organizacionId, ordenId, linea)))
    .execute();
}

function filaDeLinea(organizacionId: string, ordenId: string, linea: LineaPreparada) {
  const { producto, valorada } = linea;
  const esVariable = producto.tipoVenta === 'variable_medida';
  const esPorcion = producto.tipoVenta === 'porcion_contenedor';
  const total = valorada.precio.subtotalCentavos;

  return {
    id: linea.id,
    organizacion_id: organizacionId,
    orden_id: ordenId,
    producto_id: producto.id,
    // SNAPSHOT: es lo que se imprime, no el nombre actual del producto.
    producto_nombre: producto.nombre,
    sku: producto.sku,
    codigo_barras: producto.codigoBarras,
    cantidad: valorada.cantidad,
    unidad: valorada.unidad,
    precio_unitario_centavos: valorada.precio.precioUnitarioCentavos,
    costo_unitario_centavos: producto.costoUnitarioCentavos,
    subtotal_centavos: total,
    total_centavos: total,
    // EL INVARIANTE DE F1-04 §7.3: `costo_total_linea_snapshot` no se guarda,
    // se deriva como `total − utilidad`. Si esto dejara de ser `total − costo`,
    // esa derivación mentiría en todos los tickets ya impresos.
    utilidad_centavos: total - valorada.costoTotalCentavos,
    es_mayoreo: valorada.precio.esMayoreo,
    tipo_venta: producto.tipoVenta,
    cantidad_variable: esVariable ? valorada.cantidad : null,
    unidad_variable: esVariable ? valorada.unidad : null,
    nombre_porcion: esPorcion ? producto.nombrePorcion : null,
    cantidad_porciones: esPorcion ? valorada.cantidad : null,
    ml_por_porcion: esPorcion ? producto.mlPorPorcion : null,
    precio_por_unidad_centavos: precioPorUnidad(producto),
    notas: linea.notas,
    orden_visual: linea.ordenVisual,
    // La cocina arranca con todo pendiente. `comanda_items.estado` lo refleja
    // y los dos se mantienen coherentes en la misma transacción (F1-04 §7.5).
    estado_preparacion: 'pendiente',
    area_preparacion_snapshot: producto.areaPreparacion,
    ...instantaneaDeInsumoBase(producto),
    // `cantidad_base_consumo` se queda nula A PROPÓSITO: la llena el cobro, que
    // es el único momento en que el inventario se toca (regla 5 de F1-01 §3 y
    // el comentario de `Mesero.jsx:514`). Enviar a cocina no descuenta nada.
    cantidad_base_consumo: null,
  };
}

function precioPorUnidad(producto: ProductoDeComanda): bigint | null {
  if (producto.tipoVenta === 'variable_medida') return producto.precioPorUnidadVariableCentavos;
  if (producto.tipoVenta === 'porcion_contenedor') return producto.precioPorPorcionCentavos;
  return null;
}

/**
 * El insumo base, con su nombre copiado en la línea.
 *
 * El `check orden_linea_insumo_base_con_nombre` exige que si hay puntero haya
 * nombre: el puntero se puede anular y el ticket no. Que el nombre falte con el
 * puntero puesto sólo puede pasar si el insumo es de otra organización, que la
 * llave compuesta `productos_insumo_base_misma_org` ya impide — y por eso se
 * grita en vez de escribir la línea a medias.
 */
function instantaneaDeInsumoBase(producto: ProductoDeComanda): {
  insumo_base_id: string | null;
  insumo_base_nombre: string | null;
} {
  if (producto.insumoBaseId === null) return { insumo_base_id: null, insumo_base_nombre: null };
  if (producto.insumoBaseNombre === null) {
    throw new ErrorDominio(
      'CATALOGO_INVALIDO',
      `"${producto.nombre}" apunta a un insumo base que no existe en este negocio.`,
      { productoId: producto.id },
    );
  }
  return {
    insumo_base_id: producto.insumoBaseId,
    insumo_base_nombre: producto.insumoBaseNombre,
  };
}
