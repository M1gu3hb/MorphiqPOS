/**
 * LO QUE `caja.estado` CONTESTA, como lo pinta «Caja y corte» del salón.
 *
 * ── El defecto que esto arregla (D.1 de la 2.4) ──────────────────────────────────
 * La tabla «El día» leía `cobradoCentavos`, `liquidacionesCentavos`,
 * `propinasEntregadasCentavos`, `rentasCobradasCentavos` y `citasSinCerrar`, y el comando
 * no devuelve NINGUNO: con la caja abierta, la recepcionista leía «$NaN» en los cuatro
 * renglones con los que se cuadra el día. Es el mismo defecto que tenía la caja de la
 * tienda (`abarrotes/estado-de-caja.ts`), y se arregla igual: se lee SÓLO lo que el
 * comando devuelve, traducido una vez y con su prueba tipada contra `EstadoCaja`.
 *
 * ── De dónde sale cada renglón ────────────────────────────────────────────────────
 * «Cobrado» es lo que entró por todos los métodos (`ventasCentavos`, de los pagos del
 * turno). Lo demás sale de los MOVIMIENTOS del cajón, con su signo: la propina que entró al
 * cajón —que se le debe a quien atendió—, el gasto, el retiro, la devolución y la
 * liquidación —la salida más grande del día, con la comisión y la propina en su sobre—. La
 * apertura y el efectivo de las ventas no van: el fondo no es movimiento del día, y el
 * efectivo cobrado ya está en «Cobrado».
 */

/** Lo que devuelve `caja.estado` (`packages/app/src/caja/consulta.ts`), lo que aquí se lee. */
export interface EstadoCajaDelSalon {
  readonly abierta: boolean;
  readonly puedeAdministrar?: boolean;
  readonly sesionCajaId: string | null;
  readonly ventasCentavos: string;
  readonly movimientos: readonly { readonly tipo: string; readonly montoCentavos: string }[];
}

/** Un renglón de «El día». Con signo: lo que entró suma, lo que salió del cajón resta. */
export interface RenglonDelDia {
  readonly clave: string;
  readonly concepto: string;
  readonly nota?: string;
  readonly centavos: number;
}

/** Lo que pinta la pantalla. */
export interface EstadoDelSalon {
  readonly sesionCajaId: string | null;
  /** Si se le enseñan el gasto, la devolución y el retiro (el servidor lo exige igual). */
  readonly puedeAdministrar: boolean;
  readonly renglones: readonly RenglonDelDia[];
}

/** Los movimientos que se enseñan, en el orden en que se explican. */
const RENGLONES: readonly {
  readonly tipo: string;
  readonly concepto: string;
  readonly nota?: string;
  /** Si el renglón va aunque hoy no haya ninguno: la liquidación se busca siempre. */
  readonly siempre?: boolean;
}[] = [
  {
    tipo: 'propina',
    concepto: 'Propina al cajón',
    nota: 'No es del salón: se le debe a quien atendió y se le paga en su liquidación.',
  },
  { tipo: 'anticipo_cita', concepto: 'Anticipos recibidos' },
  { tipo: 'deposito', concepto: 'Entradas al cajón' },
  { tipo: 'gasto', concepto: 'Gastos pagados del cajón' },
  { tipo: 'devolucion', concepto: 'Devoluciones' },
  { tipo: 'retiro', concepto: 'Retiros' },
  {
    tipo: 'liquidacion',
    concepto: 'Liquidaciones pagadas',
    nota: 'Comisión y propina de cada profesional, en dos renglones de su comprobante.',
    siempre: true,
  },
];

/** La apertura no es del día y el efectivo de las ventas ya va en «Cobrado». */
const NO_SE_ENSENAN: readonly string[] = ['apertura', 'venta'];

export function estadoDelSalon(servidor: EstadoCajaDelSalon): EstadoDelSalon {
  const suma = new Map<string, number>();
  for (const movimiento of servidor.movimientos) {
    if (NO_SE_ENSENAN.includes(movimiento.tipo)) continue;
    suma.set(movimiento.tipo, (suma.get(movimiento.tipo) ?? 0) + Number(movimiento.montoCentavos));
  }
  const conocidos = RENGLONES.filter((r) => r.siempre === true || suma.has(r.tipo)).map(
    (r): RenglonDelDia => ({
      clave: r.tipo,
      concepto: r.concepto,
      ...(r.nota === undefined ? {} : { nota: r.nota }),
      centavos: suma.get(r.tipo) ?? 0,
    }),
  );
  // Un tipo que el salón no conoce también se enseña: esconderlo descuadra la lectura.
  const otros = [...suma]
    .filter(([tipo]) => !RENGLONES.some((r) => r.tipo === tipo))
    .map(([tipo, centavos]): RenglonDelDia => ({ clave: tipo, concepto: tipo, centavos }));
  return {
    sesionCajaId: servidor.abierta ? servidor.sesionCajaId : null,
    puedeAdministrar: servidor.puedeAdministrar ?? false,
    renglones: [
      { clave: 'cobrado', concepto: 'Cobrado', centavos: Number(servidor.ventasCentavos) },
      ...conocidos,
      ...otros,
    ],
  };
}
