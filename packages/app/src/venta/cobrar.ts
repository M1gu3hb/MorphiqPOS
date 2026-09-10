import 'server-only';

import { ErrorDominio, PAQUETES_MOSTRADOR } from '@morphiqpos/contracts';
import { calcularConsumo, type LineaParaConsumo } from '@morphiqpos/domain/inventario';
import type { Transaccion } from '@morphiqpos/data';
import { repoCaja, repoFolios, repoOrdenes, repoStock, repoVentaCatalogo } from '@morphiqpos/data';

import { definirComando } from '../definicion.ts';
import { comandarLineasPendientes } from '../restaurante/comandar-pendientes.ts';
import { marcarPropinaDeOrden, registrarPagoConPropina } from '../propinas/cobro.ts';
import { entradaCobrarOrdenConPropina } from '../propinas/esquemas.ts';
import { cotizar, exigirTotalVigente } from './cotizar.ts';
import { repartirPagos } from './pagos.ts';

/**
 * `cobrarOrden` — la tarea más importante del corte (F1.1-A-09).
 *
 * UNA transacción escribe todos los efectos: totales de la orden, estado, folio,
 * pagos con su propina, movimientos de caja —venta y propina en efectivo—,
 * movimientos de stock, existencias y auditoría.
 * O confirma todo, o no persiste nada (R10).
 *
 * El orden de los pasos no es arbitrario. El stock se descuenta ANTES de tomar
 * el folio: si no hay inventario, la transacción se revierte y el consecutivo
 * vuelve atrás con ella, sin dejar hueco en la numeración. Al revés, cada venta
 * fallida se comería un folio y el SAT vería saltos que nadie sabe explicar.
 *
 * El descuento de stock lo hace `aplicarMovimientos` del carril B, con la
 * guarda en el `WHERE` y el ledger inmutable. Aquí se llama, no se reimplementa.
 */

export interface ResultadoCobro {
  readonly ordenId: string;
  readonly serie: string;
  readonly folio: string;
  /** La VENTA, sin propina. Regla 1 de `F1-01` §3: nunca se infla. */
  readonly totalCentavos: string;
  readonly pagadoCentavos: string;
  /** Aparte, jamás dentro de `totalCentavos`. Ni en utilidad, ni en margen. */
  readonly propinaCentavos: string;
  readonly cambioCentavos: string;
}

export const cobrarOrden = definirComando<
  Transaccion,
  typeof entradaCobrarOrdenConPropina,
  ResultadoCobro
>({
  nombre: 'venta.cobrar',
  entidad: 'orden',
  escribe: true,
  roles: ['cajero', 'gerente', 'administrador', 'dueno'],
  paquetes: PAQUETES_MOSTRADOR,
  entrada: entradaCobrarOrdenConPropina,
  async ejecutar(ctx, entrada) {
    const { organizacionId, sucursalId, terminalId, empleoId } = ctx.ambito;
    if (sucursalId === null || terminalId === null) {
      throw new ErrorDominio(
        'VENTA_SIN_TERMINAL',
        'Para cobrar hace falta una terminal dada de alta en una sucursal.',
      );
    }

    // 1 · La orden, y que siga siendo cobrable.
    const orden = await ctx.paso('cargar_orden', () =>
      repoOrdenes.ordenPorId(ctx.tx, organizacionId, entrada.ordenId),
    );
    if (orden === null) throw new ErrorDominio('ORDEN_NO_ENCONTRADA', 'Esa venta ya no existe.');
    // Los estados VIVOS, no sólo 'borrador'. Un restaurante cobra cuentas que
    // ya pasaron por cocina: `restaurante.enviar_pedido` deja la orden en
    // 'confirmada' y `restaurante.solicitar_cuenta` en 'cuenta_solicitada'.
    // Exigir 'borrador' aquí respondía «esa venta ya se cobró» a una cuenta que
    // nadie había cobrado, y como tampoco se podía editar ni liberar la mesa,
    // la mesa quedaba fuera de servicio hasta que alguien corriera SQL a mano.
    // La lista es una sola y vive en el repositorio, junto al `where` del
    // `update` que la impone: dos listas separadas se desincronizan.
    if (!(repoOrdenes.ESTADOS_COBRABLES as readonly string[]).includes(orden.estado)) {
      throw new ErrorDominio('ORDEN_NO_EDITABLE', 'Esa venta ya se cobró o se canceló.', {
        estado: orden.estado,
      });
    }

    // 2 · El total se recalcula DENTRO de esta transacción, sobre las líneas
    //     que se están congelando. Nunca se usa un importe del cliente (P0-07).
    const { cotizacion, totales } = await ctx.paso('cotizar', () =>
      cotizar(ctx.tx, organizacionId, entrada.ordenId),
    );
    if (cotizacion.lineas.length === 0) {
      throw new ErrorDominio('ORDEN_VACIA', 'No se puede cobrar una venta sin productos.');
    }
    exigirTotalVigente(totales.totalCentavos, entrada.totalEsperadoCentavos);

    // 3 · Los pagos tienen que sumar exactamente el total. Un pago mixto son
    //     varias filas en `pagos` (corrige P1-11).
    const pagos = repartirPagos(entrada.pagos, totales.totalCentavos);

    // 4 · La caja tiene que estar abierta: sin sesión, el efectivo no tiene
    //     dónde registrarse y el arqueo del día nace incompleto.
    const sesion = await ctx.paso('cargar_caja', () =>
      repoCaja.sesionAbiertaDeTerminal(ctx.tx, organizacionId, terminalId),
    );
    if (sesion === null) {
      throw new ErrorDominio('CAJA_CERRADA', 'Abre la caja antes de cobrar.');
    }

    // 5 · Stock ANTES del folio: si falta inventario, la reversión no deja
    //     hueco en la numeración.
    const movimientos = await planearConsumo(ctx.tx, organizacionId, sucursalId, entrada.ordenId);
    if (movimientos.length > 0) {
      await ctx.paso('descontar_stock', () =>
        repoStock.aplicarMovimientos(
          movimientos.map((m) => ({ ...m, empleadoId: empleoId })),
          ctx.tx,
        ),
      );
    }

    // 6 · Folio atómico con UPDATE … RETURNING (F1.1-A-05).
    const folio = await ctx.paso('tomar_folio', () =>
      repoFolios.tomarFolio(ctx.tx, organizacionId, sucursalId),
    );

    // 7 · Pagos y movimiento de caja. La propina va en su propia columna de
    //     `pagos`, con su método, exacta: si el comensal dejó 50 en efectivo y
    //     30 en tarjeta, son 50 y 30 (regla 3 de `F1-01` §3).
    let efectivo = 0n;
    let propinaEfectivo = 0n;
    let propinaTotal = 0n;
    for (const pago of pagos) {
      await registrarPagoConPropina(ctx.tx, {
        organizacionId,
        ordenId: entrada.ordenId,
        sesionCajaId: sesion.id,
        metodo: pago.metodo,
        montoCentavos: pago.montoCentavos,
        propinaCentavos: pago.propinaCentavos,
        recibidoCentavos: pago.recibidoCentavos,
        cambioCentavos: pago.cambioCentavos,
        referencia: pago.referencia,
        idempotencyKey: null,
      });
      propinaTotal += pago.propinaCentavos;
      if (pago.metodo !== 'efectivo') continue;
      efectivo += pago.montoCentavos;
      propinaEfectivo += pago.propinaCentavos;
    }

    if (efectivo > 0n) {
      await repoCaja.registrarMovimiento(ctx.tx, {
        organizacionId,
        sesionCajaId: sesion.id,
        tipo: 'venta',
        montoCentavos: efectivo,
        referenciaTipo: 'orden',
        referenciaId: entrada.ordenId,
        empleadoId: empleoId,
        motivo: null,
      });
    }

    // La propina en efectivo mueve el cajón: está físicamente ahí. Va como
    // movimiento propio —`tipo='propina'`, previsto en el `check` desde
    // `003:306` y hasta hoy nunca escrito— y NO sumada a la venta, porque el
    // arqueo deriva el esperado de la suma de `movimientos_caja`
    // (`repos/caja.ts:134`). Así el efectivo esperado del corte incluye la
    // propina en efectivo sin que nadie tenga que acordarse de sumarla, que es
    // la regla 4 de `F1-01` §3. Tarjeta y transferencia no mueven el cajón.
    if (propinaEfectivo > 0n) {
      await repoCaja.registrarMovimiento(ctx.tx, {
        organizacionId,
        sesionCajaId: sesion.id,
        tipo: 'propina',
        montoCentavos: propinaEfectivo,
        referenciaTipo: 'orden',
        referenciaId: entrada.ordenId,
        empleadoId: empleoId,
        motivo: null,
      });
    }

    // 8 · Congelar la orden con sus totales y su folio.
    await ctx.paso('cerrar_orden', () =>
      repoOrdenes.marcarPagada(ctx.tx, {
        organizacionId,
        ordenId: entrada.ordenId,
        sesionCajaId: sesion.id,
        empleadoCobraId: empleoId,
        serie: folio.serie,
        folio: folio.folio,
        totales,
        // La MISMA hora que el resto de la transacción. `ctx.ahora` y no
        // `now()`: el pago, el movimiento de caja y el cierre de la orden
        // tienen que caer en el mismo instante, o un corte acotado al minuto
        // los repartiría entre dos.
        ahora: ctx.ahora,
      }),
    );

    // 9 · Cómo se decidió la propina (porcentaje, monto a mano, desde dónde).
    //     Sólo metadatos: en `ordenes` no cabe ningún importe de propina, y por
    //     eso `total_centavos` no se puede inflar con una (F1-04 §6.1).
    await ctx.paso('registrar_propina', () =>
      marcarPropinaDeOrden(ctx.tx, {
        organizacionId,
        ordenId: entrada.ordenId,
        puntosBase: entrada.propinaPuntosBase,
        tipo: entrada.propinaTipo,
        origen: entrada.propinaOrigen,
      }),
    );

    // 10 · A la cocina lo que todavía no salió.
    //
    //      En una MESA no hace nada: las líneas ya llevan su `comanda_items`
    //      desde `restaurante.enviar_pedido`. En el MOSTRADOR no hay ese paso
    //      —se arma el carrito y se cobra— y aquí es donde el plato tiene que
    //      llegar a la plancha.
    //
    //      `POS.jsx:462` lo hacía después del cobro, en un bucle por área y con
    //      `.catch(() => {})` encima: si fallaba, el cajero veía su ticket
    //      impreso y en cocina no había nada. Dentro de la transacción, o hay
    //      venta y comanda o no hay ninguna de las dos.
    const comandas = await ctx.paso('comandar_pendientes', () =>
      comandarLineasPendientes(ctx.tx, organizacionId, entrada.ordenId),
    );

    const cambio = pagos.reduce((suma, p) => suma + p.cambioCentavos, 0n);

    ctx.auditar({
      entidadId: entrada.ordenId,
      payload: {
        folio: `${folio.serie}-${folio.folio.toString()}`,
        totalCentavos: totales.totalCentavos.toString(),
        propinaCentavos: propinaTotal.toString(),
        metodos: pagos.map((p) => p.metodo),
        lineas: cotizacion.lineas.length,
        movimientosStock: movimientos.length,
        comandasEmitidas: comandas.length,
      },
    });

    return {
      ordenId: entrada.ordenId,
      serie: folio.serie,
      folio: folio.folio.toString(),
      totalCentavos: totales.totalCentavos.toString(),
      pagadoCentavos: pagos.reduce((s, p) => s + p.montoCentavos, 0n).toString(),
      propinaCentavos: propinaTotal.toString(),
      cambioCentavos: cambio.toString(),
      comandas,
    };
  },
});

/**
 * Traduce las líneas de la orden al contrato de consumo del carril B.
 *
 * ── Por qué las RECETAS entran aquí y no «en F1.3» ─────────────────────────
 * Este código decía «recetas llegan en F1.3» y sólo traducía `sku`. En una
 * tiendita eso basta: un producto es un artículo del almacén. En un restaurante
 * NO: vender una arrachera tiene que descontar 280 g de arrachera, 150 g de
 * frijol, 150 g de arroz y 4 tortillas, y con sólo `sku` no se descontaba nada.
 * El inventario no se movía, y la pantalla de Inventario era decoración.
 *
 * Lo comprobé cobrando una mesa de verdad: la cerveza —que sí es `sku`— bajó
 * dos; la arrachera y el guacamole no movieron un gramo.
 *
 * El dominio ya sabía hacerlo (`calcularConsumo` admite `receta` desde F1.2 y
 * tiene sus pruebas): lo que faltaba era leer las líneas de receta y pasárselas.
 *
 * ── Lo que se omite, y por qué omitir es lo correcto ───────────────────────
 * Un producto sin insumo ni receta —un servicio, una propina de barra— no
 * descuenta nada. Lo que no se puede traducir se OMITE en vez de inventarle un
 * insumo: descontar del almacén equivocado es peor que no descontar, porque el
 * error se propaga a todos los costos y nadie lo ve.
 */
async function planearConsumo(
  tx: Transaccion,
  organizacionId: string,
  sucursalId: string,
  ordenId: string,
): Promise<ReturnType<typeof calcularConsumo>> {
  const almacenId = await repoVentaCatalogo.almacenPrincipal(tx, organizacionId, sucursalId);
  if (almacenId === null) return [];

  const lineas = await repoOrdenes.lineasDeOrden(tx, organizacionId, ordenId);
  const paraConsumo: LineaParaConsumo[] = [];

  // Las dos lecturas de catálogo se hacen ANTES del bucle y en una consulta
  // cada una: esto corre dentro de la transacción del cobro, y cada viaje de
  // más mantiene el bloqueo de las existencias abierto un poco más.
  const productoIds = [
    ...new Set(lineas.map((l) => l.productoId).filter((id): id is string => id !== null)),
  ];
  const recetas = await repoVentaCatalogo.recetasDeProductos(tx, organizacionId, productoIds);

  for (const linea of lineas) {
    if (linea.productoId === null) continue;
    const producto = await repoVentaCatalogo.productoParaVender(
      tx,
      organizacionId,
      linea.productoId,
    );
    if (producto === null) continue;

    const comun = {
      organizacionId,
      almacenId,
      ordenId,
      lineaId: linea.id,
      cantidad: linea.cantidad,
      permiteVentaSinStock: producto.permiteVentaSinStock,
    };

    if (producto.estrategiaConsumo === 'sku') {
      if (producto.insumoId === null || producto.unidadBaseInsumo === null) continue;
      paraConsumo.push({
        ...comun,
        estrategiaConsumo: 'sku',
        insumoId: producto.insumoId,
        unidadVenta: linea.unidad,
        unidadBase: producto.unidadBaseInsumo,
      });
      continue;
    }

    if (producto.estrategiaConsumo === 'receta') {
      const ingredientes = recetas.get(linea.productoId) ?? [];
      // Un producto marcado «receta» SIN líneas activas no descuenta nada. Es
      // un estado legítimo —una receta recién vaciada— y no un error: la venta
      // no se bloquea por eso.
      if (ingredientes.length === 0) continue;
      paraConsumo.push({
        ...comun,
        estrategiaConsumo: 'receta',
        receta: ingredientes.map((i) => ({
          insumoId: i.insumoId,
          cantidad: i.cantidad,
          unidad: i.unidad,
          unidadBase: i.unidadBase,
          // La base guarda la merma en PUNTOS BASE (500 = 5 %) y el dominio la
          // espera en por ciento. Confundirlas sería descontar cien veces más.
          mermaPorcentaje: (i.mermaBp / 100).toString(),
        })),
      });
      continue;
    }
  }

  return calcularConsumo(paraConsumo);
}
