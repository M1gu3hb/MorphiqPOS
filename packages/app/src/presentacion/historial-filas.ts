import { cantidadATexto, desdeDiezmilesimas } from '@morphiqpos/domain/catalogo';

import type { CompraPlaneada, GastoPlaneado } from './historial-abasto.ts';
import { idDeterminista } from './historial-azar.ts';
import type { ComandaPlaneada, CuentaPlaneada, LineaPlaneada } from './historial-cuentas.ts';
import type { ContextoDeHistorial, Fila } from './historial-tipos.ts';

/**
 * De lo planeado a las filas de la base.
 *
 * Aquí no se decide NADA: cada fila copia un número que el plan ya calculó con las funciones
 * del cobro. Lo único propio de este archivo es el vocabulario de las columnas —qué nombre lleva
 * cada cosa en `ordenes`, `pagos`, `comandas`…— y el estado final de lo histórico: todo está
 * pagado, entregado, cerrado. Nada queda vivo.
 */

const SERIE_DE_VENTAS = 'A';
const UN_MINUTO = 60_000;

export interface FilasDeCuentas {
  readonly ordenes: Fila<'ordenes'>[];
  readonly lineas: Fila<'orden_lineas'>[];
  readonly pagos: Fila<'pagos'>[];
  readonly comandas: Fila<'comandas'>[];
  readonly comandaItems: Fila<'comanda_items'>[];
  readonly movimientosStock: Fila<'movimientos_stock'>[];
  readonly autorizaciones: Fila<'autorizaciones_descuento'>[];
}

function filaDeOrden(
  ctx: ContextoDeHistorial,
  sesionId: string,
  cuenta: CuentaPlaneada,
  folio: bigint,
): Fila<'ordenes'> {
  const esMesa = cuenta.canal === 'aqui';
  const { totales, cobro, satisfaccion } = cuenta;
  return {
    id: cuenta.id,
    organizacion_id: ctx.organizacionId,
    sucursal_id: ctx.sucursalId,
    terminal_id: ctx.terminalId,
    sesion_caja_id: sesionId,
    serie: SERIE_DE_VENTAS,
    folio,
    estrategia_captura: esMesa ? 'mesa' : 'mostrador',
    estrategia_cumplimiento: esMesa ? 'preparacion' : 'inmediato',
    estado: 'pagada',
    empleado_atiende_id: cuenta.mesero.id,
    empleado_cobra_id: cuenta.cajero.id,
    subtotal_centavos: totales.subtotalCentavos,
    descuento_centavos: totales.descuentoCentavos,
    impuestos_centavos: totales.impuestosCentavos,
    total_centavos: totales.totalCentavos,
    costo_total_centavos: totales.costoTotalCentavos,
    utilidad_centavos: totales.utilidadCentavos,
    margen_bp: totales.margenBp,
    canal: cuenta.canal,
    nombre_pedido: cuenta.nombrePedido,
    mesa_id: cuenta.mesa?.id ?? null,
    personas: esMesa ? cuenta.personas : 0,
    propina_puntos_base: cobro.propina.puntosBase,
    propina_tipo: cobro.propina.tipo,
    propina_origen: cobro.propina.origen,
    precuentas_impresas: cuenta.precuentaEn === null ? 0 : 1,
    precuenta_impresa_en: cuenta.precuentaEn,
    satisfaccion_score: satisfaccion?.puntaje ?? null,
    satisfaccion_emoji: satisfaccion?.emoji ?? null,
    satisfaccion_comentario: satisfaccion?.comentario ?? null,
    satisfaccion_en: satisfaccion?.en ?? null,
    created_at: cuenta.abiertaEn,
    updated_at: cuenta.cobradaEn,
    cerrada_en: cuenta.cobradaEn,
  };
}

function filaDeLinea(
  ctx: ContextoDeHistorial,
  cuenta: CuentaPlaneada,
  linea: LineaPlaneada,
): Fila<'orden_lineas'> {
  const { producto } = linea;
  return {
    id: linea.id,
    orden_id: cuenta.id,
    organizacion_id: ctx.organizacionId,
    producto_id: producto.id,
    // Instantáneas: el ticket de hace un mes sigue diciendo lo que decía.
    producto_nombre: producto.nombre,
    sku: producto.sku,
    codigo_barras: producto.codigoBarras,
    cantidad: String(linea.cantidad),
    unidad: producto.unidadVenta,
    precio_unitario_centavos: producto.precioCentavos,
    costo_unitario_centavos: producto.costoCentavos,
    descuento_centavos: linea.descuentoCentavos,
    subtotal_centavos: linea.subtotalCentavos,
    total_centavos: linea.totalCentavos,
    utilidad_centavos: linea.totalCentavos - linea.costoCentavos,
    es_mayoreo: false,
    tipo_venta: 'precio_fijo',
    orden_visual: linea.orden,
    estado_preparacion: 'entregado',
    marcha_estado: 'inmediata',
    tiempo_servicio: producto.tiempoServicio,
    area_preparacion_snapshot: producto.areaPreparacion,
    created_at: cuenta.abiertaEn,
    updated_at: cuenta.cobradaEn,
    opciones: null,
    tipo_linea: 'venta',
    anulada_en: null,
    motivo_anulacion: null,
    empleado_anula_id: null,
    combo_id: null,
  };
}

function filasDeComanda(
  ctx: ContextoDeHistorial,
  cuenta: CuentaPlaneada,
  comanda: ComandaPlaneada,
  lineas: ReadonlyMap<string, LineaPlaneada>,
): { comanda: Fila<'comandas'>; items: Fila<'comanda_items'>[] } {
  const esMesa = cuenta.canal === 'aqui';
  return {
    comanda: {
      id: comanda.id,
      organizacion_id: ctx.organizacionId,
      orden_id: cuenta.id,
      mesa_id: cuenta.mesa?.id ?? null,
      estacion_preparacion_id: comanda.estacion.id,
      area: comanda.area,
      estado: 'entregado',
      iniciada_en: comanda.iniciadaEn,
      lista_en: comanda.listaEn,
      entregada_en: comanda.entregadaEn,
      marchada_en: comanda.marchadaEn,
      // En el mostrador el cliente empieza a esperar al pagar; en una mesa no aplica.
      cobrado_en: esMesa ? null : cuenta.cobradaEn,
      sucursal_id: ctx.sucursalId,
      empleado_responsable_id: cuenta.mesero.id,
      estacion_nombre: comanda.estacion.nombre,
      estacion_color: comanda.estacion.color,
      origen: esMesa ? 'mesero' : 'pos',
      created_at: comanda.marchadaEn,
      updated_at: comanda.entregadaEn,
    },
    items: comanda.items.flatMap((item, visual) => {
      const linea = lineas.get(item.lineaId);
      if (linea === undefined) return [];
      return [
        {
          id: idDeterminista(comanda.id, 'item', visual),
          organizacion_id: ctx.organizacionId,
          comanda_id: comanda.id,
          orden_linea_id: linea.id,
          producto_id: linea.producto.id,
          producto_nombre: linea.producto.nombre,
          cantidad: String(linea.cantidad),
          estado: 'entregado',
          tipo_venta: 'precio_fijo',
          orden_visual: visual,
          iniciado_en: comanda.iniciadaEn,
          listo_en: item.listoEn,
          minutos_estimados: linea.producto.minutosPreparacion,
          created_at: comanda.marchadaEn,
          updated_at: comanda.entregadaEn,
        } satisfies Fila<'comanda_items'>,
      ];
    }),
  };
}

function filasDePago(
  ctx: ContextoDeHistorial,
  sesionId: string,
  cuenta: CuentaPlaneada,
): Fila<'pagos'>[] {
  return cuenta.cobro.pagos.map((pago, i) => ({
    id: idDeterminista(cuenta.id, 'pago', i),
    orden_id: cuenta.id,
    organizacion_id: ctx.organizacionId,
    sesion_caja_id: sesionId,
    metodo: pago.metodo,
    monto_centavos: pago.montoCentavos,
    propina_centavos: pago.propinaCentavos,
    recibido_centavos: pago.recibidoCentavos,
    cambio_centavos: pago.cambioCentavos,
    referencia: pago.referencia,
    estado: 'confirmado',
    created_at: cuenta.cobradaEn,
  }));
}

function filasDeConsumo(
  ctx: ContextoDeHistorial,
  cuenta: CuentaPlaneada,
): Fila<'movimientos_stock'>[] {
  return cuenta.consumo.map((m) => ({
    id: idDeterminista(cuenta.id, 'stock', m.insumoId),
    organizacion_id: ctx.organizacionId,
    almacen_id: m.almacenId,
    insumo_id: m.insumoId,
    tipo: m.tipo,
    // El ledger guarda la salida con signo negativo; el valor sale como lo escribe el cobro.
    cantidad: `-${m.cantidad}`,
    unidad: m.unidad,
    costo_unitario_centavos: ctx.insumos.get(m.insumoId)?.costoCentavos ?? 0n,
    referencia_tipo: m.referenciaTipo,
    referencia_id: m.referenciaId,
    empleado_id: cuenta.cajero.id,
    idempotency_key: m.idempotencyKey,
    created_at: cuenta.cobradaEn,
  }));
}

function filaDeAutorizacion(
  ctx: ContextoDeHistorial,
  cuenta: CuentaPlaneada,
): Fila<'autorizaciones_descuento'>[] {
  const descuento = cuenta.descuento;
  if (descuento?.autorizadoPor == null) return [];
  return [
    {
      id: idDeterminista(cuenta.id, 'autorizacion'),
      organizacion_id: ctx.organizacionId,
      sucursal_id: ctx.sucursalId,
      orden_id: cuenta.id,
      solicita_empleo_id: cuenta.cajero.id,
      autoriza_empleo_id: descuento.autorizadoPor.id,
      autoriza_rol: descuento.autorizadoPor.rol,
      descuento_centavos: descuento.totalCentavos,
      tope_centavos: ctx.topeDelCajero.topeCentavos,
      base_centavos: descuento.baseCentavos,
      tope_bp: ctx.topeDelCajero.topeBp,
      motivo: descuento.motivo,
      // La firma del supervisor es un minuto antes del cobro.
      created_at: new Date(cuenta.cobradaEn.getTime() - UN_MINUTO),
    },
  ];
}

/** Las filas de todas las cuentas del día; los folios siguen el orden en que se cobró. */
export function filasDeCuentas(
  ctx: ContextoDeHistorial,
  sesionId: string,
  cuentas: readonly CuentaPlaneada[],
  primerFolio: bigint,
): FilasDeCuentas {
  const salida: FilasDeCuentas = {
    ordenes: [],
    lineas: [],
    pagos: [],
    comandas: [],
    comandaItems: [],
    movimientosStock: [],
    autorizaciones: [],
  };
  for (const [i, cuenta] of cuentas.entries()) {
    salida.ordenes.push(filaDeOrden(ctx, sesionId, cuenta, primerFolio + BigInt(i)));
    const porId = new Map(cuenta.lineas.map((l) => [l.id, l] as const));
    for (const linea of cuenta.lineas) salida.lineas.push(filaDeLinea(ctx, cuenta, linea));
    salida.pagos.push(...filasDePago(ctx, sesionId, cuenta));
    for (const comanda of cuenta.comandas) {
      const { comanda: fila, items } = filasDeComanda(ctx, cuenta, comanda, porId);
      salida.comandas.push(fila);
      salida.comandaItems.push(...items);
    }
    salida.movimientosStock.push(...filasDeConsumo(ctx, cuenta));
    salida.autorizaciones.push(...filaDeAutorizacion(ctx, cuenta));
  }
  return salida;
}

export interface FilasDeAbasto {
  readonly compras: Fila<'compras'>[];
  readonly compraLineas: Fila<'compra_lineas'>[];
  readonly entradasDeStock: Fila<'movimientos_stock'>[];
  readonly gastos: Fila<'gastos'>[];
}

/** Las filas de las compras de la mañana y de los gastos del día. */
export function filasDeAbasto(
  ctx: ContextoDeHistorial,
  dia: string,
  sesionId: string,
  compras: readonly CompraPlaneada[],
  gastos: readonly GastoPlaneado[],
): FilasDeAbasto {
  const salida: FilasDeAbasto = { compras: [], compraLineas: [], entradasDeStock: [], gastos: [] };
  for (const compra of compras) {
    salida.compras.push({
      id: compra.id,
      organizacion_id: ctx.organizacionId,
      sucursal_id: ctx.sucursalId,
      proveedor_id: compra.proveedor.id,
      proveedor_nombre: compra.proveedor.nombre,
      fecha: dia,
      total_centavos: compra.totalCentavos,
      metodo_pago: compra.metodoPago,
      factura_folio: compra.facturaFolio,
      notas: null,
      empleado_id: compra.empleado.id,
      created_at: compra.creadaEn,
      updated_at: compra.creadaEn,
    });
    for (const linea of compra.lineas) {
      const texto = cantidadATexto(desdeDiezmilesimas(linea.cantidad));
      salida.compraLineas.push({
        id: linea.id,
        organizacion_id: ctx.organizacionId,
        compra_id: compra.id,
        insumo_id: linea.insumo.id,
        insumo_nombre: linea.insumo.nombre,
        cantidad_capturada: texto,
        unidad_capturada: linea.insumo.unidadBase,
        equivalencia: '1',
        cantidad: texto,
        costo_total_centavos: linea.costoTotalCentavos,
        created_at: compra.creadaEn,
        updated_at: compra.creadaEn,
      });
      salida.entradasDeStock.push({
        id: idDeterminista(linea.id, 'stock'),
        organizacion_id: ctx.organizacionId,
        almacen_id: ctx.almacenId,
        insumo_id: linea.insumo.id,
        tipo: 'entrada_compra',
        cantidad: texto,
        unidad: linea.insumo.unidadBase,
        costo_unitario_centavos: linea.insumo.costoCentavos,
        referencia_tipo: 'compra',
        referencia_id: compra.id,
        empleado_id: compra.empleado.id,
        created_at: compra.creadaEn,
      });
    }
  }
  for (const gasto of gastos) {
    salida.gastos.push({
      id: gasto.id,
      organizacion_id: ctx.organizacionId,
      sucursal_id: ctx.sucursalId,
      // Un gasto en efectivo sale del cajón y se ata a su sesión; los demás no.
      sesion_caja_id: gasto.metodoPago === 'efectivo' ? sesionId : null,
      fecha: dia,
      categoria: gasto.categoria,
      descripcion: gasto.descripcion,
      monto_centavos: gasto.montoCentavos,
      metodo_pago: gasto.metodoPago,
      es_recurrente: gasto.esRecurrente,
      empleado_id: gasto.empleado.id,
      created_at: gasto.creadoEn,
      updated_at: gasto.creadoEn,
    });
  }
  return salida;
}
