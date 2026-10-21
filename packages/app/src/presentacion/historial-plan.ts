import { aDiezmilesimas } from '@morphiqpos/domain/dinero';

import { consumoPorInsumo, planearCompras, planearGastos } from './historial-abasto.ts';
import { azarDelDia, idDeterminista } from './historial-azar.ts';
import { planearCaja } from './historial-caja.ts';
import { planearCuentas, platillosConConsumoValido } from './historial-cuentas.ts';
import { filasDeAbasto, filasDeCuentas } from './historial-filas.ts';
import type {
  ContextoDeHistorial,
  DeltaDeExistencia,
  EstadoDelDia,
  Fila,
  PlanDelDia,
} from './historial-tipos.ts';

/**
 * El día completo de un espejo, listo para escribirse.
 *
 * Es el único sitio donde se juntan las piezas: las cuentas deciden qué se vendió y cuándo; de
 * ahí salen el consumo de inventario, las compras que lo reponen y el efectivo que entró a la
 * caja; y la caja, con todo eso, se cierra. Cada pieza se apoya en la anterior, de modo que lo
 * que cuadra por construcción no tiene que verificarse después.
 */

/** Cuánto sube o baja la existencia de cada insumo por lo escrito en el ledger del día. */
function deltasDeExistencia(
  movimientos: readonly Fila<'movimientos_stock'>[],
): DeltaDeExistencia[] {
  const totales = new Map<string, bigint>();
  for (const m of movimientos) {
    totales.set(m.insumo_id, (totales.get(m.insumo_id) ?? 0n) + aDiezmilesimas(m.cantidad));
  }
  return [...totales.entries()]
    .filter(([, cantidad]) => cantidad !== 0n)
    .map(([insumoId, cantidad]) => ({ insumoId, cantidad }))
    .sort((a, b) => a.insumoId.localeCompare(b.insumoId));
}

export function planearDia(
  ctx: ContextoDeHistorial,
  estado: EstadoDelDia,
  dia: string,
): PlanDelDia {
  const azar = azarDelDia(ctx.semilla, ctx.organizacionId, dia);
  const sesionId = idDeterminista(ctx.organizacionId, ctx.semilla, dia, 'sesion');

  const cuentas = planearCuentas({ ctx, dia, azar, productos: platillosConConsumoValido(ctx) });
  const consumo = consumoPorInsumo(cuentas.flatMap((c) => c.consumo));
  const compras = planearCompras(azar, ctx, dia, estado, consumo);
  const gastos = planearGastos(azar, ctx, dia);

  const caja = planearCaja({ ctx, dia, azar, sesionId, cuentas, gastos, estado });
  const deCuentas = filasDeCuentas(ctx, sesionId, cuentas, estado.folioOrden);
  const deAbasto = filasDeAbasto(ctx, dia, sesionId, compras, gastos);
  const movimientosStock = [...deAbasto.entradasDeStock, ...deCuentas.movimientosStock];

  const ventas = cuentas.reduce((suma, c) => suma + c.totales.totalCentavos, 0n);
  const propinas = cuentas.reduce((suma, c) => suma + c.cobro.propina.totalCentavos, 0n);

  return {
    dia,
    sesion: caja.sesion,
    ordenes: deCuentas.ordenes,
    lineas: deCuentas.lineas,
    pagos: deCuentas.pagos,
    movimientosCaja: caja.movimientos,
    comandas: deCuentas.comandas,
    comandaItems: deCuentas.comandaItems,
    compras: deAbasto.compras,
    compraLineas: deAbasto.compraLineas,
    gastos: deAbasto.gastos,
    movimientosStock,
    autorizaciones: deCuentas.autorizaciones,
    cortesTurno: caja.cortes,
    conteos: caja.conteos,
    deltasDeExistencia: deltasDeExistencia(movimientosStock),
    foliosConsumidos: { orden: BigInt(cuentas.length), caja: 1n, turno: 1n },
    resumen: {
      dia,
      tickets: cuentas.length,
      ventasCentavos: ventas,
      propinasCentavos: propinas,
      efectivoEsperadoCentavos: caja.efectivoEsperadoCentavos,
      compras: compras.length,
      gastos: gastos.length,
    },
  };
}
