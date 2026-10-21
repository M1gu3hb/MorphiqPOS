import { aDiezmilesimas, deDiezmilesimas, porCantidad } from '@morphiqpos/domain/dinero';

import { idDeterminista, type Azar } from './historial-azar.ts';
import { diaDeLaSemana, instanteLocal, minutosDe } from './historial-fechas.ts';
import type {
  ContextoDeHistorial,
  EmpleadoRef,
  EstadoDelDia,
  InsumoRef,
  ProveedorRef,
} from './historial-tipos.ts';

/**
 * El abasto y los gastos de un día: lo que entra a la bodega y lo que sale de la bolsa.
 *
 * ── Las compras salen de lo que SE VENDIÓ ──────────────────────────────────
 * No hay un calendario fijo de compras: hay un criterio. Si con lo que se va a vender hoy lo que
 * queda de un insumo se acerca a menos de día y medio de operación, se compra por la mañana lo
 * que lleve la bodega a tres días al cerrar, redondeado al empaque del proveedor. Así el saldo
 * nunca baja de cero —el ledger lo exige— y las compras tienen el ritmo que tendrían en un
 * restaurante: más seguido el pollo que el azúcar.
 *
 * El saldo con que se decide es el del LEDGER hasta el inicio del día (ver `leerEstadoDelDia`):
 * la primera mañana del historial compra lo que haga falta como si la bodega estuviera vacía,
 * porque en el kardex lo está —el inventario inicial de un espejo se anotó hoy—.
 *
 * Se compra ANTES de abrir y se paga por transferencia o tarjeta: una compra de contado sale
 * del cajón y necesitaría una caja abierta a esa hora. Los gastos pequeños sí salen del cajón.
 */

const MINUTOS_DE_COMPRA = [
  minutosDe(9, 30),
  minutosDe(10, 15),
  minutosDe(11, 0),
  minutosDe(11, 40),
];
const ESCALA = 10_000n;
/** Se compra hasta que, al cerrar el día, queden tres días de lo que hoy se vende. */
const DIAS_DE_EXISTENCIA_OBJETIVO = 3n;
/** Y se compra cuando lo que queda no llega a día y medio (en décimas de día). */
const DECIMAS_DE_DIA_DE_PISO = 15n;

export interface LineaDeCompraPlaneada {
  readonly id: string;
  readonly insumo: InsumoRef;
  /** En diezmilésimas, ya en la unidad base del insumo. */
  readonly cantidad: bigint;
  readonly costoTotalCentavos: bigint;
}

export interface CompraPlaneada {
  readonly id: string;
  readonly proveedor: ProveedorRef;
  readonly metodoPago: 'transferencia' | 'tarjeta';
  readonly facturaFolio: string | null;
  readonly creadaEn: Date;
  readonly empleado: EmpleadoRef;
  readonly lineas: readonly LineaDeCompraPlaneada[];
  readonly totalCentavos: bigint;
}

export interface GastoPlaneado {
  readonly id: string;
  readonly categoria: string;
  readonly descripcion: string;
  readonly montoCentavos: bigint;
  readonly metodoPago: 'efectivo' | 'tarjeta' | 'transferencia';
  readonly creadoEn: Date;
  readonly esRecurrente: boolean;
  readonly empleado: EmpleadoRef;
}

/** Cuánto trae un empaque del proveedor, en la unidad base del insumo. */
function empaqueDe(unidadBase: string): bigint {
  if (unidadBase === 'g' || unidadBase === 'ml') return 1_000n * ESCALA;
  if (unidadBase === 'pieza') return 12n * ESCALA;
  return ESCALA;
}

function sobreElEmpaque(cantidad: bigint, empaque: bigint): bigint {
  return ((cantidad + empaque - 1n) / empaque) * empaque;
}

function mayor(a: bigint, b: bigint): bigint {
  return a > b ? a : b;
}

/** Lo que se va a consumir en el día, por insumo, a partir de los movimientos ya planeados. */
export function consumoPorInsumo(
  movimientos: readonly { readonly insumoId: string; readonly cantidad: string }[],
): Map<string, bigint> {
  const totales = new Map<string, bigint>();
  for (const m of movimientos) {
    totales.set(m.insumoId, (totales.get(m.insumoId) ?? 0n) + aDiezmilesimas(m.cantidad));
  }
  return totales;
}

/** Cuánto hay que comprar de un insumo hoy para no quedarse corto; cero si alcanza. */
function cuantoComprar(insumo: InsumoRef, existencia: bigint, consumoDelDia: bigint): bigint {
  const quedaria = existencia - consumoDelDia;
  const piso = mayor((consumoDelDia * DECIMAS_DE_DIA_DE_PISO) / 10n, insumo.stockMinimo * 2n);
  if (quedaria >= piso) return 0n;
  // Lo que debe quedar en la bodega al cerrar el día; se completa con empaques enteros.
  const reserva = mayor(consumoDelDia * DIAS_DE_EXISTENCIA_OBJETIVO, insumo.stockMinimo * 4n);
  return sobreElEmpaque(reserva - quedaria, empaqueDe(insumo.unidadBase));
}

function proveedorDe(ctx: ContextoDeHistorial, insumo: InsumoRef): ProveedorRef | undefined {
  return ctx.proveedores.find((p) => p.id === insumo.proveedorId) ?? ctx.proveedores[0];
}

interface Faltante {
  readonly insumo: InsumoRef;
  readonly cantidad: bigint;
}

function faltantes(
  ctx: ContextoDeHistorial,
  estado: EstadoDelDia,
  consumo: ReadonlyMap<string, bigint>,
): Faltante[] {
  const pendientes: Faltante[] = [];
  for (const [insumoId, consumido] of consumo) {
    const insumo = ctx.insumos.get(insumoId);
    if (insumo === undefined) continue;
    const cantidad = cuantoComprar(insumo, estado.existencias.get(insumoId) ?? 0n, consumido);
    if (cantidad > 0n) pendientes.push({ insumo, cantidad });
  }
  return pendientes.sort((a, b) => a.insumo.nombre.localeCompare(b.insumo.nombre));
}

/** Las compras de la mañana: una por proveedor con faltantes. */
export function planearCompras(
  azar: Azar,
  ctx: ContextoDeHistorial,
  dia: string,
  estado: EstadoDelDia,
  consumo: ReadonlyMap<string, bigint>,
): readonly CompraPlaneada[] {
  const comprador = ctx.gerentes[0];
  if (comprador === undefined) return [];

  const porProveedor = new Map<string, { proveedor: ProveedorRef; faltantes: Faltante[] }>();
  for (const faltante of faltantes(ctx, estado, consumo)) {
    const proveedor = proveedorDe(ctx, faltante.insumo);
    if (proveedor === undefined) continue;
    const grupo = porProveedor.get(proveedor.id) ?? { proveedor, faltantes: [] };
    grupo.faltantes.push(faltante);
    porProveedor.set(proveedor.id, grupo);
  }

  return [...porProveedor.values()].map((grupo, k) => {
    const id = idDeterminista(ctx.organizacionId, ctx.semilla, dia, 'compra', k);
    const lineas = grupo.faltantes.map((f, j) => ({
      id: idDeterminista(id, 'linea', j),
      insumo: f.insumo,
      cantidad: f.cantidad,
      costoTotalCentavos: porCantidad(f.insumo.costoCentavos, deDiezmilesimas(f.cantidad)),
    }));
    const minuto = MINUTOS_DE_COMPRA[k % MINUTOS_DE_COMPRA.length] ?? minutosDe(10, 0);
    return {
      id,
      proveedor: grupo.proveedor,
      metodoPago: azar.probabilidad(0.6) ? 'transferencia' : 'tarjeta',
      facturaFolio: azar.probabilidad(0.75) ? `FAC-${String(azar.entero(10_000, 99_999))}` : null,
      creadaEn: instanteLocal(dia, minuto + azar.entero(0, 12), ctx.zona),
      empleado: comprador,
      lineas,
      totalCentavos: lineas.reduce((suma, l) => suma + l.costoTotalCentavos, 0n),
    } satisfies CompraPlaneada;
  });
}

interface PlantillaDeGasto {
  readonly categoria: string;
  readonly descripcion: string;
  readonly minimo: number;
  readonly maximo: number;
  readonly efectivo: number;
  readonly recurrente?: boolean;
}

const GASTOS_COMUNES: readonly { readonly valor: PlantillaDeGasto; readonly peso: number }[] = [
  {
    valor: {
      categoria: 'limpieza',
      descripcion: 'Artículos de limpieza (cloro, jabón, trapeadores)',
      minimo: 18_000,
      maximo: 42_000,
      efectivo: 0.7,
    },
    peso: 30,
  },
  {
    valor: {
      categoria: 'otro',
      descripcion: 'Hielo para la barra',
      minimo: 9_000,
      maximo: 16_000,
      efectivo: 1,
    },
    peso: 30,
  },
  {
    valor: {
      categoria: 'transporte',
      descripcion: 'Gas LP, carga de cilindro',
      minimo: 45_000,
      maximo: 68_000,
      efectivo: 0.5,
    },
    peso: 15,
  },
  {
    valor: {
      categoria: 'reparacion',
      descripcion: 'Mantenimiento de refrigeración',
      minimo: 80_000,
      maximo: 250_000,
      efectivo: 0.1,
    },
    peso: 8,
  },
  {
    valor: {
      categoria: 'marketing',
      descripcion: 'Impresión de menús y volantes',
      minimo: 35_000,
      maximo: 90_000,
      efectivo: 0.3,
    },
    peso: 6,
  },
];

const DIA_DEL_INTERNET = 5;
const DIA_DE_LA_LUZ = 12;

/** Los pagos del mes que caen en una fecha fija, además de los gastos de todos los días. */
function gastosFijos(azar: Azar, dia: string): PlantillaDeGasto[] {
  const diaDelMes = Number(dia.slice(8, 10));
  const fijos: PlantillaDeGasto[] = [];
  if (diaDelMes === DIA_DEL_INTERNET) {
    fijos.push({
      categoria: 'servicios',
      descripcion: 'Servicio de internet y teléfono',
      minimo: 89_900,
      maximo: 89_900,
      efectivo: 0,
      recurrente: true,
    });
  }
  if (diaDelMes === DIA_DE_LA_LUZ) {
    fijos.push({
      categoria: 'servicios',
      descripcion: 'Pago de luz (CFE)',
      minimo: 240_000,
      maximo: 340_000,
      efectivo: 0,
      recurrente: true,
    });
  }
  if (diaDeLaSemana(dia) === 1 && azar.probabilidad(0.5)) {
    fijos.push({
      categoria: 'servicios',
      descripcion: 'Recolección de basura y grasas',
      minimo: 35_000,
      maximo: 35_000,
      efectivo: 0,
      recurrente: true,
    });
  }
  return fijos;
}

/** El tope de un gasto que sale del cajón: el fondo siempre alcanza para él. */
const TOPE_DE_UN_GASTO_EN_EFECTIVO = 70_000;

export function planearGastos(
  azar: Azar,
  ctx: ContextoDeHistorial,
  dia: string,
): readonly GastoPlaneado[] {
  const responsable = ctx.gerentes[0];
  if (responsable === undefined) return [];

  const delDia = azar.probabilidad(0.5) ? [azar.ponderado(GASTOS_COMUNES)] : [];
  const todos = [...gastosFijos(azar, dia), ...delDia];

  return todos.map((plantilla, k) => {
    // En pesos enteros: un gasto con centavos sueltos descuadra el conteo del cajón.
    const monto = BigInt(Math.trunc(azar.entero(plantilla.minimo, plantilla.maximo) / 100)) * 100n;
    const enEfectivo =
      monto <= BigInt(TOPE_DE_UN_GASTO_EN_EFECTIVO) && azar.probabilidad(plantilla.efectivo);
    const metodoPago = enEfectivo
      ? 'efectivo'
      : azar.elegir<'tarjeta' | 'transferencia'>(['transferencia', 'transferencia', 'tarjeta']);
    // Lo que sale del cajón se paga con la caja abierta; lo demás, en horas de oficina.
    const minuto = enEfectivo
      ? azar.entero(minutosDe(14, 0), minutosDe(20, 30))
      : azar.entero(minutosDe(10, 0), minutosDe(18, 0));
    return {
      id: idDeterminista(ctx.organizacionId, ctx.semilla, dia, 'gasto', k),
      categoria: plantilla.categoria,
      descripcion: plantilla.descripcion,
      montoCentavos: monto,
      metodoPago,
      creadoEn: instanteLocal(dia, minuto, ctx.zona),
      esRecurrente: plantilla.recurrente === true,
      empleado: responsable,
    } satisfies GastoPlaneado;
  });
}
