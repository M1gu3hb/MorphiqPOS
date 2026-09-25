/**
 * GENERADO por `scripts/generar-unidades-del-puente.mjs` desde `packages/app/src/puente/mapa.ts`.
 * No se edita a mano: `pnpm verify:unidades` se pone en rojo si se desfasa del mapa.
 *
 * Por entidad del puente, sus campos de DINERO y la unidad en que llegan al navegador:
 * `'pesos'` (`conversion: 'dinero'`, aunque el nombre diga `_centavos`) o `'centavos'`.
 * Lo lee `centavosDe` (`dinero-del-puente.ts`); una pantalla no decide por el nombre.
 */
export const UNIDADES_DEL_PUENTE = {
  AutorizadoCuenta: {
    tope_por_salida_centavos: 'pesos',
    tope_por_salida_pesos: 'pesos',
  },
  BeneficiarioPropina: {
    monto_centavos: 'pesos',
    monto_pesos: 'pesos',
  },
  CarteraFiado: {
    limite_centavos: 'centavos',
    saldo_centavos: 'centavos',
  },
  CarteraPorObra: {
    limite_centavos: 'centavos',
    saldo_centavos: 'centavos',
  },
  CitaServicio: {
    precio_centavos: 'pesos',
    precio_pesos: 'pesos',
  },
  Cliente: {
    limite_credito_centavos: 'pesos',
    limite_credito_pesos: 'pesos',
    saldo_pendiente_centavos: 'pesos',
    saldo_pendiente_pesos: 'pesos',
  },
  ComisionCausada: {
    base_centavos: 'pesos',
    base_pesos: 'pesos',
    monto_centavos: 'pesos',
    monto_pesos: 'pesos',
  },
  CompraInsumo: {
    total_compra: 'pesos',
  },
  ConsumoInterno: {
    costo_centavos: 'pesos',
    costo_pesos: 'pesos',
  },
  ConteoDeZona: {
    costoCentavos: 'centavos',
  },
  CorteCaja: {
    diferencia_al_cerrar: 'pesos',
    dinero_dejado_en_caja: 'pesos',
    efectivo_contado: 'pesos',
    efectivo_inicial_contado: 'pesos',
    efectivo_retirado: 'pesos',
    esperado_al_cerrar: 'pesos',
    fondo_esperado_apertura: 'pesos',
  },
  DetalleCompra: {
    costo_total: 'pesos',
  },
  DetalleVenta: {
    costo_unitario_snapshot: 'pesos',
    descuento: 'pesos',
    precio_por_unidad_snapshot: 'pesos',
    precio_unitario_snapshot: 'pesos',
    subtotal: 'pesos',
    total: 'pesos',
    utilidad: 'pesos',
  },
  Equivalencia: {
    precioCentavos: 'centavos',
  },
  ExistenciaMaterial: {
    dineroParadoCentavos: 'centavos',
  },
  GastoOperativo: {
    monto: 'pesos',
  },
  Ingrediente: {
    costo_compra_default: 'pesos',
    costo_por_unidad_base: 'pesos',
    valor_inventario: 'pesos',
  },
  Liquidacion: {
    comision_centavos: 'pesos',
    comision_pesos: 'pesos',
    propina_centavos: 'pesos',
    propina_pesos: 'pesos',
    renta_centavos: 'pesos',
    renta_pesos: 'pesos',
    total_centavos: 'pesos',
    total_pesos: 'pesos',
  },
  LiquidacionPropina: {
    total_liquidado: 'pesos',
  },
  MaterialContinuo: {
    costoCentavos: 'centavos',
    precioCentavos: 'centavos',
    precioRemateCentavos: 'centavos',
  },
  MaterialMostrador: {
    costoCentavos: 'centavos',
    precioCentavos: 'centavos',
  },
  Modificador: {
    delta_precio_centavos: 'centavos',
  },
  MovimientoCaja: {
    monto_centavos: 'centavos',
  },
  MovimientoInventario: {
    costo_unitario_en_momento: 'pesos',
  },
  NotaDeCaja: {
    limiteClienteCentavos: 'centavos',
    saldoClienteCentavos: 'centavos',
    totalCentavos: 'centavos',
  },
  Obra: {
    limite_centavos: 'pesos',
    limite_pesos: 'pesos',
  },
  OperacionComision: {
    comision_centavos: 'pesos',
    comision_pesos: 'pesos',
    monto_ajeno_centavos: 'pesos',
    monto_ajeno_pesos: 'pesos',
  },
  PagoCredito: {
    monto_centavos: 'centavos',
  },
  PedidoAnticipado: {
    total_centavos: 'centavos',
  },
  PiezaAbierta: {
    precio_remate_centavos: 'pesos',
    precio_remate_pesos: 'pesos',
  },
  PlantillaGasto: {
    monto_sugerido: 'pesos',
  },
  Presentacion: {
    precio_venta_centavos: 'pesos',
    precio_venta_pesos: 'pesos',
  },
  ProductoTerminado: {
    costo_calculado_actual: 'pesos',
    precio_por_porcion: 'pesos',
    precio_por_unidad_variable: 'pesos',
    precio_venta: 'pesos',
    utilidad_bruta_actual: 'pesos',
  },
  RecetaEscandallo: {
    costo_linea_calculado: 'pesos',
    costo_unitario_base_snapshot: 'pesos',
  },
  Redondeo: {
    importe_centavos: 'pesos',
    importe_pesos: 'pesos',
  },
  Remision: {
    importe_centavos: 'pesos',
    importe_pesos: 'pesos',
    saldo_documento_centavos: 'pesos',
    saldo_documento_pesos: 'pesos',
  },
  SaldoComisionista: {
    comision_acumulada_centavos: 'pesos',
    comision_acumulada_pesos: 'pesos',
    saldo_centavos: 'pesos',
    saldo_pesos: 'pesos',
  },
  SolicitudQR: {
    propina_monto_sugerida: 'pesos',
    subtotal_consumo: 'pesos',
  },
  Venta: {
    cambio: 'pesos',
    costo_total_snapshot: 'pesos',
    descuentos: 'pesos',
    impuestos: 'pesos',
    monto_efectivo: 'pesos',
    monto_tarjeta: 'pesos',
    monto_transferencia: 'pesos',
    propina_efectivo: 'pesos',
    propina_monto: 'pesos',
    propina_tarjeta: 'pesos',
    propina_transferencia: 'pesos',
    subtotal: 'pesos',
    total: 'pesos',
    total_cobrado_con_propina: 'pesos',
    utilidad_bruta_snapshot: 'pesos',
  },
} as const;

export type EntidadConDinero = keyof typeof UNIDADES_DEL_PUENTE;
export type CampoDeDinero<E extends EntidadConDinero> = keyof (typeof UNIDADES_DEL_PUENTE)[E] &
  string;
