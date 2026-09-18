import 'server-only';

import type { Transaccion } from '@morphiqpos/data';

import { productosDeComanda } from './catalogo-comanda.ts';
import { insertarComandas, insertarItems } from './comandas.ts';
import { estacionesActivas, ordenParaComandar } from './datos.ts';
import { agruparEnComandas, areasDe, resolverEstacion } from './estaciones.ts';
import type { LineaPreparada } from './lineas.ts';

/**
 * Manda a la cocina las líneas de una orden que TODAVÍA no tienen comanda.
 *
 * ── El defecto que cierra: la venta de mostrador que nunca llega ───────────
 * `POS.jsx:462` creaba un `PedidoPreparacion` por área dentro de un bucle, con
 * `.catch(() => {})` en la línea siguiente. Cuando fallaba, el cajero veía el
 * cobro correcto y el ticket impreso, y en cocina no había NADA: ni pedido, ni
 * sonido. El cliente esperaba de pie hasta que preguntaba.
 *
 * En una mesa, las comandas ya salieron con `restaurante.enviar_pedido`: el
 * mesero manda a cocina y cobra después. En el mostrador NO HAY ese paso —se
 * arma el carrito y se cobra— así que la comanda tiene que salir al cobrar, y
 * en la MISMA transacción: o hay venta y comanda, o no hay ninguna de las dos.
 *
 * ── Por qué «pendientes» y no «todas» ──────────────────────────────────────
 * Esta función corre en TODO cobro, también en el de mesa. Allí las líneas ya
 * tienen su `comanda_items`, y volver a comandarlas mandaría el pedido dos
 * veces a la plancha. El filtro por las que no tienen item es lo que hace que
 * la misma llamada sirva para los dos caminos sin preguntar de dónde viene la
 * orden — que es el tipo de pregunta que se responde mal con el tiempo.
 */

interface LineaSinComanda {
  readonly id: string;
  /**
   * Nulo cuando la línea es un concepto libre («servicio», «descorche») que no
   * apunta a ningún producto del catálogo. Esas no se comandan: no hay nada que
   * preparar ni estación a la que mandarlas.
   */
  readonly productoId: string | null;
  readonly cantidad: string;
  readonly unidad: string;
  readonly notas: string | null;
  readonly ordenVisual: number;
  readonly tiempoServicio: number | null;
}

export interface ComandaEmitidaAlCobrar {
  readonly id: string;
  readonly area: string;
  readonly estacionId: string;
  readonly items: number;
}

export async function comandarLineasPendientes(
  tx: Transaccion,
  organizacionId: string,
  ordenId: string,
  ahora: Date = new Date(),
): Promise<readonly ComandaEmitidaAlCobrar[]> {
  const lineas = await lineasSinComanda(tx, organizacionId, ordenId);
  if (lineas.length === 0) return [];

  const deCatalogo = lineas.filter(
    (l): l is LineaSinComanda & { productoId: string } => l.productoId !== null,
  );
  if (deCatalogo.length === 0) return [];

  const productos = await productosDeComanda(
    tx,
    organizacionId,
    deCatalogo.map((l) => l.productoId),
  );
  const estaciones = await estacionesActivas(tx, organizacionId);

  const preparadas: LineaPreparada[] = [];
  for (const linea of deCatalogo) {
    const producto = productos.get(linea.productoId);
    // Un producto archivado entre la captura y el cobro no puede tumbar el
    // cobro: la venta ya ocurrió y el dinero está en el cajón. Lo que no puede
    // es inventarse una estación, así que esa línea no se comanda y se cobra
    // igual —el cocinero la ve en el ticket impreso, que sí lleva todo—.
    if (producto === undefined) continue;
    /**
     * Sin área de preparación, la línea no va a ninguna cocina: una botella de
     * agua no se cocina.
     *
     * ── Y esto NO era un atajo: era el defecto que impedía cobrar en una tienda
     * Aquí decía `=== ''`, y el valor con el que el sistema dice «esto no se
     * prepara» es **`'ninguno'`** —está en `AREAS_PREPARACION`, lo escribe la
     * siembra y lo entiende `areasDe`—. La cadena vacía no la escribe nadie.
     *
     * Consecuencia: los 22 productos de la tienda, con `area_preparacion =
     * 'ninguno'`, pasaban de largo y llegaban a `resolverEstacion`, que sin
     * estaciones **lanza**. Cobrar en el mostrador de una tienda respondía «No hay
     * ninguna estación de preparación activa. Crea la "Cocina general"…» y no se
     * cobraba nada. En una cafetería con estación general habría sido peor sin
     * hacer ruido: una comanda de cocina por cada botella de agua.
     *
     * Ahora se pregunta con la MISMA función que decide después —`areasDe`— así
     * que las dos decisiones no pueden volver a discrepar.
     */
    if (areasDe(producto.areaPreparacion).length === 0) continue;

    preparadas.push({
      id: linea.id,
      producto,
      valorada: { cantidad: linea.cantidad, unidad: linea.unidad } as LineaPreparada['valorada'],
      estacion: resolverEstacion(producto.estacionDeCategoriaId, estaciones),
      areaPreparacion: producto.areaPreparacion,
      // Al COBRAR ya no hay nada que retener: la comida salió o no salió, y lo
      // que quede pendiente se manda entero. Marchar es una decisión de sala
      // que ocurre antes, no en la caja.
      tiempoServicio: linea.tiempoServicio,
      marchaEstado: 'inmediata',
      notas: linea.notas,
      ordenVisual: linea.ordenVisual,
    });
  }

  if (preparadas.length === 0) return [];

  const orden = await ordenParaComandar(tx, organizacionId, ordenId);
  const comandas = agruparEnComandas(preparadas).map((grupo) => ({
    id: crypto.randomUUID(),
    grupo,
  }));

  // Estas comandas NACEN DEL COBRO: es el caso del mostrador, y por eso llevan
  // `cobrado_en`. Las de mesa salen por `enviar_pedido` y no lo llevan.
  await insertarComandas(tx, {
    organizacionId,
    orden,
    notas: null,
    comandas,
    marchadaEn: ahora,
    cobradoEn: ahora,
  });
  await insertarItems(tx, organizacionId, comandas);

  return comandas.map(({ id, grupo }) => ({
    id,
    area: grupo.area,
    estacionId: grupo.estacion.id,
    items: grupo.lineas.length,
  }));
}

/**
 * Las líneas de la orden que ningún `comanda_items` referencia.
 *
 * Tres consultas pequeñas en vez de un `not exists`, y es una decisión: el
 * `not exists` es más bonito en SQL, pero `comanda_items` no lleva `orden_id`
 * —cuelga de `comandas`— así que igualmente hacía falta el salto, y en tres
 * sentencias simples la lógica se puede probar contra la base en memoria en
 * vez de contra una reimplementación del planificador. Las tres van dentro de
 * la transacción del cobro, así que nadie puede colar una comanda en medio.
 */
async function lineasSinComanda(
  tx: Transaccion,
  organizacionId: string,
  ordenId: string,
): Promise<readonly LineaSinComanda[]> {
  const lineas = await tx
    .selectFrom('orden_lineas')
    .select([
      'id',
      'producto_id as productoId',
      'cantidad',
      'unidad',
      'notas',
      'orden_visual as ordenVisual',
      'tiempo_servicio as tiempoServicio',
    ])
    .where('organizacion_id', '=', organizacionId)
    .where('orden_id', '=', ordenId)
    // F-324 · Mandar a cocina una línea anulada haría cocinar comida que nadie
    // paga. Es el error más caro de los que este filtro evita.
    .where('anulada_en', 'is', null)
    .orderBy('orden_visual', 'asc')
    .execute();

  if (lineas.length === 0) return [];

  const comandas = await tx
    .selectFrom('comandas')
    .select(['id'])
    .where('organizacion_id', '=', organizacionId)
    .where('orden_id', '=', ordenId)
    .execute();

  if (comandas.length === 0) return lineas;

  const items = await tx
    .selectFrom('comanda_items')
    .select(['orden_linea_id as ordenLineaId'])
    .where('organizacion_id', '=', organizacionId)
    .where(
      'comanda_id',
      'in',
      comandas.map((c) => c.id),
    )
    .execute();

  const yaComandadas = new Set(items.map((i) => i.ordenLineaId));
  return lineas.filter((l) => !yaComandadas.has(l.id));
}
