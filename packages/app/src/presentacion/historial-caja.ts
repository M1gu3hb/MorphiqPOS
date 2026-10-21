import type { GastoPlaneado } from './historial-abasto.ts';
import { idDeterminista, type Azar } from './historial-azar.ts';
import {
  MINUTO_DEL_CORTE_DE_TURNO,
  cajerosDelDia,
  type CuentaPlaneada,
} from './historial-cuentas.ts';
import { instanteLocal, minutosDe } from './historial-fechas.ts';
import type { ContextoDeHistorial, EstadoDelDia, Fila } from './historial-tipos.ts';

/**
 * La caja de un día: se abre con un fondo, recibe lo cobrado en efectivo y las propinas en
 * efectivo, paga lo que sale del cajón, hace un corte de turno a media tarde y se cierra con el
 * cajón contado.
 *
 * ── Cómo se garantiza que cuadre ───────────────────────────────────────────
 * El efectivo esperado NO se calcula con una fórmula aparte: es la SUMA de los movimientos que
 * este mismo plan escribe, que es exactamente lo que hace `caja.cerrar` en producción
 * (`arqueoDeSesion`). El cajón contado es ese esperado, así que la diferencia es cero y el
 * corte de turno de media tarde cuenta lo que había en ese instante.
 *
 * ── Qué se deja en el cajón ────────────────────────────────────────────────
 * El fondo de hoy —lo que se abrió—: el de mañana es el mismo y todo lo demás se retira. Así la
 * "diferencia de apertura" de cada día es cero también. Si ese día se cobró tan poco en efectivo
 * que no alcanzó ni para el fondo, se deja todo lo contado.
 */

const FONDOS_POSIBLES = [100_000n, 120_000n, 150_000n] as const;
const ESPERA_AL_CERRAR_EN_MINUTOS = { minima: 15, maxima: 40 } as const;
const ULTIMO_CIERRE = minutosDe(23, 55);
const PRIMERA_APERTURA = minutosDe(12, 25);
const MINUTO = 60_000;
/** El desglose del fondo se redondea a múltiplos de cincuenta pesos. */
const PASO_DEL_DESGLOSE = 5_000n;

/** Billetes y monedas que se cuentan al cerrar, de mayor a menor, en centavos. */
const DENOMINACIONES = [
  100_000n,
  50_000n,
  20_000n,
  10_000n,
  5_000n,
  2_000n,
  1_000n,
  500n,
  200n,
  100n,
  50n,
] as const;

export interface PlanDeCaja {
  readonly sesion: Fila<'sesiones_caja'>;
  readonly movimientos: readonly Fila<'movimientos_caja'>[];
  readonly cortes: readonly Fila<'cortes_turno'>[];
  readonly conteos: readonly Fila<'conteos_denominacion'>[];
  readonly efectivoEsperadoCentavos: bigint;
}

export interface ParametrosDeCaja {
  readonly ctx: ContextoDeHistorial;
  readonly dia: string;
  readonly azar: Azar;
  readonly sesionId: string;
  readonly cuentas: readonly CuentaPlaneada[];
  readonly gastos: readonly GastoPlaneado[];
  readonly estado: EstadoDelDia;
}

/** Un movimiento del cajón con la hora en que ocurrió, sin tener que leerla de la fila. */
interface Movimiento {
  readonly en: Date;
  readonly fila: Fila<'movimientos_caja'>;
}

/** Cuánto hay en el cajón al abrir: lo que dejó el último cierre, o un fondo de arranque. */
function fondoDelDia(azar: Azar, estado: EstadoDelDia): bigint {
  return estado.fondoDejadoCentavos ?? azar.elegir(FONDOS_POSIBLES);
}

/** El fondo por montones, como lo pide la pantalla de apertura: monedas, chicos y grandes. */
function desgloseDelFondo(fondo: bigint): {
  readonly monedas: bigint;
  readonly chicos: bigint;
  readonly grandes: bigint;
} {
  const monedas = ((fondo * 25n) / 100n / PASO_DEL_DESGLOSE) * PASO_DEL_DESGLOSE;
  const chicos = ((fondo * 35n) / 100n / PASO_DEL_DESGLOSE) * PASO_DEL_DESGLOSE;
  return { monedas, chicos, grandes: fondo - monedas - chicos };
}

function efectivoDe(cuenta: CuentaPlaneada): { readonly venta: bigint; readonly propina: bigint } {
  return cuenta.cobro.pagos
    .filter((p) => p.metodo === 'efectivo')
    .reduce(
      (suma, p) => ({
        venta: suma.venta + p.montoCentavos,
        propina: suma.propina + p.propinaCentavos,
      }),
      { venta: 0n, propina: 0n },
    );
}

function movimientosDeUnCobro(
  cuenta: CuentaPlaneada,
  base: { readonly organizacion_id: string; readonly sesion_caja_id: string },
): Movimiento[] {
  const { venta, propina } = efectivoDe(cuenta);
  const comun = {
    ...base,
    referencia_tipo: 'orden',
    referencia_id: cuenta.id,
    empleado_id: cuenta.cajero.id,
    motivo: null,
    created_at: cuenta.cobradaEn,
  };
  const movimientos: Movimiento[] = [];
  if (venta > 0n) {
    movimientos.push({
      en: cuenta.cobradaEn,
      fila: {
        ...comun,
        id: idDeterminista(cuenta.id, 'movimiento', 'venta'),
        tipo: 'venta',
        monto_centavos: venta,
      },
    });
  }
  // La propina en efectivo mueve el cajón: está físicamente ahí. Va como movimiento propio.
  if (propina > 0n) {
    movimientos.push({
      en: cuenta.cobradaEn,
      fila: {
        ...comun,
        id: idDeterminista(cuenta.id, 'movimiento', 'propina'),
        tipo: 'propina',
        monto_centavos: propina,
      },
    });
  }
  return movimientos;
}

function movimientosDeLaCaja(p: ParametrosDeCaja, fondo: bigint, abiertaEn: Date): Movimiento[] {
  const { ctx, cuentas, gastos, sesionId } = p;
  const base = { organizacion_id: ctx.organizacionId, sesion_caja_id: sesionId };
  const { comida } = cajerosDelDia(ctx, p.dia);

  const movimientos: Movimiento[] = [
    {
      en: abiertaEn,
      fila: {
        ...base,
        id: idDeterminista(sesionId, 'movimiento', 'apertura'),
        tipo: 'apertura',
        monto_centavos: fondo,
        referencia_tipo: 'manual',
        referencia_id: null,
        empleado_id: comida.id,
        motivo: 'Fondo inicial',
        created_at: abiertaEn,
      },
    },
    ...cuentas.flatMap((cuenta) => movimientosDeUnCobro(cuenta, base)),
    // Un gasto en efectivo sale del cajón con su movimiento negativo; los demás no lo tocan.
    ...gastos
      .filter((g) => g.metodoPago === 'efectivo')
      .map((gasto) => ({
        en: gasto.creadoEn,
        fila: {
          ...base,
          id: idDeterminista(gasto.id, 'movimiento'),
          tipo: 'gasto',
          monto_centavos: -gasto.montoCentavos,
          referencia_tipo: 'gasto',
          referencia_id: gasto.id,
          empleado_id: gasto.empleado.id,
          motivo: gasto.descripcion,
          created_at: gasto.creadoEn,
        } satisfies Fila<'movimientos_caja'>,
      })),
  ];
  return movimientos.sort(
    (a, b) => a.en.getTime() - b.en.getTime() || String(a.fila.id).localeCompare(String(b.fila.id)),
  );
}

/** Lo que había en el cajón a esa hora: la suma de los movimientos hasta ella, inclusive. */
function efectivoHasta(movimientos: readonly Movimiento[], hasta: Date): bigint {
  return movimientos
    .filter((m) => m.en.getTime() <= hasta.getTime())
    .reduce((suma, m) => suma + m.fila.monto_centavos, 0n);
}

/** El conteo por denominación del efectivo contado; vacío si no cabe exacto en billetes y monedas. */
function conteoDelCierre(
  ctx: ContextoDeHistorial,
  sesionId: string,
  contado: bigint,
  quien: string,
  en: Date,
): Fila<'conteos_denominacion'>[] {
  let resto = contado;
  const filas: Fila<'conteos_denominacion'>[] = [];
  for (const denominacion of DENOMINACIONES) {
    const piezas = resto / denominacion;
    if (piezas === 0n) continue;
    resto -= piezas * denominacion;
    filas.push({
      id: idDeterminista(sesionId, 'conteo', denominacion),
      organizacion_id: ctx.organizacionId,
      sesion_caja_id: sesionId,
      momento: 'cierre',
      denominacion_centavos: denominacion,
      piezas: Number(piezas),
      contado_en: en,
      contado_por: quien,
    });
  }
  // Si queda un resto de centavos sueltos, el conteo no sumaría el contado y la pantalla
  // enseñaría un cierre contradictorio: sin conteo es lo honesto.
  return resto === 0n ? filas : [];
}

function cierreDeLaCaja(p: ParametrosDeCaja, ultimoEvento: number): Date {
  const { minima, maxima } = ESPERA_AL_CERRAR_EN_MINUTOS;
  const deseado = ultimoEvento + p.azar.entero(minima, maxima) * MINUTO;
  const tope = instanteLocal(p.dia, ULTIMO_CIERRE, p.ctx.zona).getTime();
  return new Date(Math.max(Math.min(deseado, tope), ultimoEvento));
}

function corteDeTurno(
  p: ParametrosDeCaja,
  movimientos: readonly Movimiento[],
  abiertaEn: Date,
): Fila<'cortes_turno'> {
  const { ctx, dia, azar, sesionId, estado } = p;
  const instante = instanteLocal(dia, MINUTO_DEL_CORTE_DE_TURNO + azar.entero(0, 10), ctx.zona);
  return {
    id: idDeterminista(sesionId, 'corte_turno'),
    organizacion_id: ctx.organizacionId,
    sesion_caja_id: sesionId,
    serie: 'CT',
    folio: estado.folioTurno,
    rango_inicio: abiertaEn,
    cortado_en: instante,
    empleado_id: cajerosDelDia(ctx, dia).comida.id,
    // Lo que había en el cajón a esa hora: la misma suma de movimientos que hace el arqueo.
    efectivo_contado_centavos: efectivoHasta(movimientos, instante),
    // El retiro del turno, si lo hubiera, sería un movimiento aparte; aquí no hay ninguno.
    efectivo_retirado_centavos: 0n,
    notas: null,
    created_at: instante,
    updated_at: instante,
  };
}

export function planearCaja(p: ParametrosDeCaja): PlanDeCaja {
  const { ctx, dia, azar, sesionId, cuentas, estado } = p;
  const { comida, cena } = cajerosDelDia(ctx, dia);
  const fondo = fondoDelDia(azar, estado);
  const desglose = desgloseDelFondo(fondo);
  const abiertaEn = instanteLocal(dia, PRIMERA_APERTURA + azar.entero(0, 25), ctx.zona);

  const movimientos = movimientosDeLaCaja(p, fondo, abiertaEn);
  const esperado = movimientos.reduce((suma, m) => suma + m.fila.monto_centavos, 0n);
  const ultimoEvento = Math.max(
    abiertaEn.getTime(),
    ...cuentas.map((c) => c.terminaEn.getTime()),
    ...movimientos.map((m) => m.en.getTime()),
  );
  const cerradaEn = cierreDeLaCaja(p, ultimoEvento);
  const dejado = esperado < fondo ? esperado : fondo;

  const sesion: Fila<'sesiones_caja'> = {
    id: sesionId,
    organizacion_id: ctx.organizacionId,
    sucursal_id: ctx.sucursalId,
    terminal_id: ctx.terminalId,
    empleado_abre_id: comida.id,
    empleado_cierra_id: cena.id,
    abierta_en: abiertaEn,
    cerrada_en: cerradaEn,
    estado: 'cerrada',
    serie: 'CC',
    folio: estado.folioCaja,
    fondo_inicial_centavos: fondo,
    fondo_esperado_centavos: fondo,
    fondo_monedas_centavos: desglose.monedas,
    fondo_chicos_centavos: desglose.chicos,
    fondo_grandes_centavos: desglose.grandes,
    // El cajón contado es el esperado: la diferencia es cero.
    efectivo_contado_centavos: esperado,
    efectivo_esperado_centavos: esperado,
    diferencia_centavos: 0n,
    efectivo_retirado_centavos: esperado - dejado,
    notas_cierre: null,
    created_at: abiertaEn,
    updated_at: cerradaEn,
  };

  return {
    sesion,
    movimientos: movimientos.map((m) => m.fila),
    cortes: [corteDeTurno(p, movimientos, abiertaEn)],
    conteos: conteoDelCierre(ctx, sesionId, esperado, cena.id, cerradaEn),
    efectivoEsperadoCentavos: esperado,
  };
}
