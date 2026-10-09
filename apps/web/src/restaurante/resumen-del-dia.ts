import { centavosDe } from '~/cliente/dinero-del-puente';

/**
 * EL DINERO DEL DÍA DEL RESTAURANTE, sin pantalla (C.6 y auditoría de la 2.4).
 *
 * Vive aparte de `CierreDiario.tsx` para probarse: el proyecto de pruebas `unidad` no
 * transforma JSX, y estas cuentas —qué es venta, qué es propina, qué debe haber en el
 * cajón— no tenían ninguna prueba. Por eso nadie vio que la propina en efectivo se
 * contaba dos veces en el esperado.
 */

export type Canal = 'efectivo' | 'tarjeta' | 'transferencia';

export interface VentaDelDia {
  readonly id: string;
  readonly estado: string | null;
  readonly total: number | null;
  readonly costo_total_snapshot: number | null;
  readonly propina_efectivo: number | null;
  readonly propina_tarjeta: number | null;
  readonly propina_transferencia: number | null;
  readonly monto_efectivo: number | null;
  readonly monto_tarjeta: number | null;
  readonly monto_transferencia: number | null;
  readonly usuario_mesero_nombre: string | null;
  readonly fecha_apertura: string | null;
}

export interface GastoDelDia {
  readonly id: string;
  readonly monto: number | null;
  readonly metodo_pago: string | null;
}

/** Un gasto, en centavos. Sin monto cuenta como cero: no suma, y no rompe la suma. */
function montoDe(gasto: GastoDelDia): number {
  return centavosDe('GastoOperativo', 'monto', gasto.monto) ?? 0;
}

export interface ResumenDelDia {
  readonly ventas: number;
  readonly tickets: number;
  readonly promedio: number;
  readonly costo: number;
  readonly utilidad: number;
  /** En puntos base sobre la venta: 6543 se lee 65.43 %. */
  readonly margen: number;
  readonly gastos: number;
  readonly neta: number;
  readonly propinas: Readonly<Record<Canal, number>>;
  readonly porCanal: Readonly<Record<Canal, number>>;
  readonly gastosEnEfectivo: number;
}

/**
 * El resumen del día, SIN propinas dentro del dinero del negocio.
 *
 * La propina no es venta ni margen: es dinero de los meseros que pasó por la
 * caja. Mezclarla infla la utilidad del día, y quien lea el PDF creerá que ganó
 * lo que en realidad debe.
 */
export function resumirDia(
  ventas: readonly VentaDelDia[],
  gastos: readonly GastoDelDia[],
): ResumenDelDia {
  const pagadas = ventas.filter((venta) => venta.estado === 'pagada');
  // Cada lector ya devuelve CENTAVOS —pasa por `centavosDe`—; lo que no vino suma cero.
  const suma = (lee: (venta: VentaDelDia) => number | null): number =>
    pagadas.reduce((total, venta) => total + (lee(venta) ?? 0), 0);
  const total = suma((venta) => centavosDe('Venta', 'total', venta.total));
  const costo = suma((venta) =>
    centavosDe('Venta', 'costo_total_snapshot', venta.costo_total_snapshot),
  );
  const utilidad = total - costo;
  const operativos = gastos.reduce((lleva, gasto) => lleva + montoDe(gasto), 0);
  return {
    ventas: total,
    tickets: pagadas.length,
    promedio: pagadas.length === 0 ? 0 : Math.round(total / pagadas.length),
    costo,
    utilidad,
    margen: total === 0 ? 0 : Math.round((utilidad * 10000) / total),
    gastos: operativos,
    neta: utilidad - operativos,
    propinas: {
      efectivo: suma((venta) => centavosDe('Venta', 'propina_efectivo', venta.propina_efectivo)),
      tarjeta: suma((venta) => centavosDe('Venta', 'propina_tarjeta', venta.propina_tarjeta)),
      transferencia: suma((venta) =>
        centavosDe('Venta', 'propina_transferencia', venta.propina_transferencia),
      ),
    },
    // LO VENDIDO por canal, SIN la propina (auditoría de la 2.4). `monto_*` de la vista
    // 057 es lo COBRADO por ese método —venta más propina—; leerlo como venta contaba la
    // propina dos veces en el esperado del cajón (una aquí y otra en `propinas`) y un
    // conteo correcto salía «FALTA $75». La resta es por venta, y por método: exacta.
    porCanal: {
      efectivo: suma(
        (venta) =>
          (centavosDe('Venta', 'monto_efectivo', venta.monto_efectivo) ?? 0) -
          (centavosDe('Venta', 'propina_efectivo', venta.propina_efectivo) ?? 0),
      ),
      tarjeta: suma(
        (venta) =>
          (centavosDe('Venta', 'monto_tarjeta', venta.monto_tarjeta) ?? 0) -
          (centavosDe('Venta', 'propina_tarjeta', venta.propina_tarjeta) ?? 0),
      ),
      transferencia: suma(
        (venta) =>
          (centavosDe('Venta', 'monto_transferencia', venta.monto_transferencia) ?? 0) -
          (centavosDe('Venta', 'propina_transferencia', venta.propina_transferencia) ?? 0),
      ),
    },
    gastosEnEfectivo: gastos
      .filter((gasto) => gasto.metodo_pago === 'efectivo' || gasto.metodo_pago === null)
      .reduce((lleva, gasto) => lleva + montoDe(gasto), 0),
  };
}

/** Lo que DEBERÍA haber en el cajón. No se enseña hasta que hay un conteo. */
export function esperadoEnCaja(
  datos: { readonly fondoInicial: number },
  resumen: ResumenDelDia,
): number {
  const entra = resumen.porCanal.efectivo + resumen.propinas.efectivo;
  return datos.fondoInicial + entra - resumen.gastosEnEfectivo;
}
