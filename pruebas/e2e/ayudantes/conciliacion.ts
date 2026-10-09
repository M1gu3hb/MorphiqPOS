import { expect, type Page, test } from '@playwright/test';

import {
  conciliarElDia,
  enPesosDeCentavos,
  explicar,
  type CajaDelLibro,
  type CajaDelServidor,
  type CobroDelLibro,
  type ComisionDelLibro,
  type Conciliacion,
  type ExistenciaDelLibro,
  type LibroDelDia,
  type MovimientoDelLibro,
  type PasivoDelLibro,
  type PorMetodo,
  type ServidorDelDia,
  type VentaDelServidor,
} from '../../../packages/testing/src/conciliacion.ts';

import { cabecerasDeEscrituraDePrueba, consultarPuente } from './sesion.ts';

/**
 * EL LIBRO DEL DÍA Y LA LECTURA DEL SERVIDOR, para los cinco días completos (D.2 de la 2.4).
 *
 * La decisión de si el dinero cuadra NO vive aquí: vive en `@morphiqpos/testing`
 * (`conciliarElDia`), con sus pruebas y sus mutaciones. Aquí sólo hay dos cosas:
 *
 *   · `Libro`, donde cada paso del día anota lo que hizo —qué cobró, cómo se pagó, qué
 *     caja abrió y con cuánto, qué salió del cajón, cuánto se contó—;
 *   · `leerElServidor`, que lee los registros crudos por el puente con la sesión de
 *     quien ve costos y caja, y los pone en centavos.
 *
 * El puente sirve el dinero en PESOS (`conversion: 'dinero'`); aquí se pasa a centavos
 * redondeando una sola vez, igual que `centavosDeTexto`.
 */

const centavos = (pesos: number | null | undefined): bigint =>
  BigInt(Math.round((pesos ?? 0) * 100));

/** Los estados de una venta que ya recibió dinero (`ordenes_estado_check`, 102). */
const COBRADAS: readonly string[] = ['pagada', 'parcialmente_reembolsada', 'reembolsada'];

/** Los métodos que `ordenes_pagos_resumen` desglosa por columna. */
const POR_COLUMNA: readonly string[] = ['efectivo', 'tarjeta', 'transferencia'];

interface VentaDelPuente {
  readonly id?: string;
  readonly folio?: string | null;
  readonly estado?: string | null;
  readonly total?: number | null;
  readonly metodo_pago?: string | null;
  readonly total_cobrado_con_propina?: number | null;
  readonly monto_efectivo?: number | null;
  readonly monto_tarjeta?: number | null;
  readonly monto_transferencia?: number | null;
  readonly propina_efectivo?: number | null;
  readonly propina_tarjeta?: number | null;
  readonly propina_transferencia?: number | null;
  readonly costo_total_snapshot?: number | null;
  readonly utilidad_bruta_snapshot?: number | null;
}

interface CorteDelPuente {
  readonly id?: string;
  readonly estado?: string | null;
  readonly serie?: string | null;
  readonly folio?: string | null;
  readonly efectivo_inicial_contado?: number | null;
  readonly efectivo_contado?: number | null;
  readonly esperado_al_cerrar?: number | null;
}

interface MovimientoDeCajaDelPuente {
  readonly sesion_caja_id?: string | null;
  readonly tipo?: string | null;
  readonly monto_centavos?: number | null;
}

interface MovimientoDeInventarioDelPuente {
  readonly tipo_movimiento?: string | null;
  /** `decimal`: puede llegar como texto (`'-2.0000'`) según el conductor. */
  readonly cantidad?: number | string | null;
  readonly ingrediente_nombre?: string | null;
}

/**
 * Los pagos de una venta por método. Las tres columnas de la vista, y lo que falte
 * —fiado, puntos, monedero— con el nombre de su método si fue el único, o como
 * `otro` si se mezcló: la vista no lo desglosa más. El libro anota igual
 * (`Libro.cobro` normaliza los métodos que no tienen columna).
 */
function pagosDe(venta: VentaDelPuente): PorMetodo {
  const pagos: Record<string, bigint> = {
    efectivo: centavos(venta.monto_efectivo),
    tarjeta: centavos(venta.monto_tarjeta),
    transferencia: centavos(venta.monto_transferencia),
  };
  const enColumnas = pagos['efectivo']! + pagos['tarjeta']! + pagos['transferencia']!;
  const resto = centavos(venta.total_cobrado_con_propina) - enColumnas;
  if (resto !== 0n) {
    const metodo = venta.metodo_pago ?? '';
    const clave =
      metodo !== '' && metodo !== 'mixto' && !POR_COLUMNA.includes(metodo) ? metodo : 'otro';
    pagos[clave] = resto;
  }
  return pagos;
}

function ventaDelServidor(venta: VentaDelPuente): VentaDelServidor {
  return {
    id: venta.id ?? '',
    folio: venta.folio ?? '(sin folio)',
    totalCentavos: centavos(venta.total),
    pagos: pagosDe(venta),
    propinaPorMetodo: {
      efectivo: centavos(venta.propina_efectivo),
      tarjeta: centavos(venta.propina_tarjeta),
      transferencia: centavos(venta.propina_transferencia),
    },
    costoCentavos:
      venta.costo_total_snapshot === undefined || venta.costo_total_snapshot === null
        ? null
        : centavos(venta.costo_total_snapshot),
    utilidadCentavos:
      venta.utilidad_bruta_snapshot === undefined || venta.utilidad_bruta_snapshot === null
        ? null
        : centavos(venta.utilidad_bruta_snapshot),
  };
}

export interface LecturasDelGiro {
  /** El ledger de pasivos que use el giro: recargas, abonos, cascos, anticipos. */
  readonly pasivos?: (page: Page) => Promise<readonly PasivoDelLibro[]>;
  /** Las comisiones causadas, por profesional. */
  readonly comisiones?: (
    page: Page,
  ) => Promise<readonly { readonly profesional: string; readonly centavos: bigint }[]>;
}

/**
 * LO QUE DICE EL SERVIDOR del día: TODAS las ventas cobradas y TODAS las cajas de la
 * demo. El día empieza con un reseteo, así que todo lo que hay es de este día; una
 * venta o una caja que la prueba no hizo es un hallazgo, no ruido.
 */
export async function leerElServidor(
  page: Page,
  lecturas: LecturasDelGiro = {},
): Promise<ServidorDelDia> {
  const ventas = (await consultarPuente<VentaDelPuente>(page, 'Venta', { limite: 1000 }))
    .filter((v) => COBRADAS.includes(v.estado ?? ''))
    .map(ventaDelServidor);
  const cortes = await consultarPuente<CorteDelPuente>(page, 'CorteCaja', { limite: 200 });
  const movimientos = await consultarPuente<MovimientoDeCajaDelPuente>(page, 'MovimientoCaja', {
    limite: 2000,
  });
  const cajas: CajaDelServidor[] = cortes.map((corte) => ({
    sesionCajaId: corte.id ?? '',
    folio: `${corte.serie ?? ''}${corte.serie === null || corte.serie === undefined ? '' : '-'}${corte.folio ?? '(abierta)'}`,
    fondoCentavos: centavos(corte.efectivo_inicial_contado),
    // Una caja abierta no tiene esperado guardado: se concilian cerradas.
    esperadoCentavos: centavos(corte.esperado_al_cerrar),
    contadoCentavos:
      corte.efectivo_contado === undefined || corte.efectivo_contado === null
        ? null
        : centavos(corte.efectivo_contado),
    movimientos: movimientos
      .filter((m) => m.sesion_caja_id === corte.id)
      .map((m) => ({ tipo: m.tipo ?? '', montoCentavos: BigInt(m.monto_centavos ?? 0) })),
  }));
  const inventario = await consultarPuente<MovimientoDeInventarioDelPuente>(
    page,
    'MovimientoInventario',
    { limite: 2000 },
  );
  return {
    ventas,
    cajas,
    pasivos: lecturas.pasivos === undefined ? [] : await lecturas.pasivos(page),
    comisiones: lecturas.comisiones === undefined ? [] : await lecturas.comisiones(page),
    movimientosDeInventario: inventario.map((m) => ({
      producto: m.ingrediente_nombre ?? '',
      cantidad: Number(m.cantidad ?? 0),
      origen: m.tipo_movimiento ?? '',
    })),
  };
}

/** La existencia de un insumo por su nombre, como la sirve el puente. */
export async function existenciaDe(page: Page, insumo: string): Promise<number> {
  const filas = await consultarPuente<{ nombre?: string; stock_actual?: number | string | null }>(
    page,
    'Ingrediente',
    { filtro: { nombre: insumo }, limite: 5 },
  );
  const fila = filas.find((f) => f.nombre === insumo);
  expect(fila, `El inventario no tiene ningún insumo «${insumo}».`).toBeDefined();
  return Number(fila?.stock_actual ?? 0);
}

/** La sesión de caja de la terminal de esta pestaña, o `null` si está cerrada. */
export async function sesionDeLaCaja(page: Page): Promise<string | null> {
  const respuesta = await page.request.post('/api/caja/estado', {
    headers: cabecerasDeEscrituraDePrueba(),
    data: {},
  });
  expect(respuesta.status(), 'No se pudo leer el estado de la caja de esta terminal.').toBe(200);
  const cuerpo = (await respuesta.json()) as {
    readonly datos?: { readonly abierta?: boolean; readonly sesionCajaId?: string | null };
  };
  return cuerpo.datos?.abierta === true ? (cuerpo.datos.sesionCajaId ?? null) : null;
}

/**
 * EL LIBRO DEL DÍA: lo que la prueba hizo, paso a paso.
 *
 * Mutable por dentro y sólo por sus métodos: cada paso anota y nadie reescribe lo
 * anotado. Al final, `libro()` lo congela para la conciliación.
 */
export class Libro {
  readonly #cajas: CajaDelLibro[] = [];
  readonly #cobros: CobroDelLibro[] = [];
  readonly #pasivos: PasivoDelLibro[] = [];
  readonly #comisiones: ComisionDelLibro[] = [];
  readonly #inventario = new Map<string, ExistenciaDelLibro>();

  /** Se abrió una caja con su fondo. */
  abrirCaja(referencia: string, sesionCajaId: string, fondoCentavos: number): void {
    this.#cajas.push({
      referencia,
      sesionCajaId,
      fondoCentavos: BigInt(fondoCentavos),
      movimientos: [],
      contadoCentavos: null,
    });
  }

  #caja(sesionCajaId: string): CajaDelLibro {
    const caja = this.#cajas.find((c) => c.sesionCajaId === sesionCajaId);
    if (caja === undefined) throw new Error(`El libro no tiene abierta la caja ${sesionCajaId}.`);
    return caja;
  }

  #reemplazar(caja: CajaDelLibro): void {
    const i = this.#cajas.findIndex((c) => c.sesionCajaId === caja.sesionCajaId);
    this.#cajas[i] = caja;
  }

  /** Algo entró o salió del cajón sin ser un cobro: con su signo. */
  movimiento(sesionCajaId: string, concepto: string, efectivoCentavos: number): void {
    const caja = this.#caja(sesionCajaId);
    const movimiento: MovimientoDelLibro = { concepto, efectivoCentavos: BigInt(efectivoCentavos) };
    this.#reemplazar({ ...caja, movimientos: [...caja.movimientos, movimiento] });
  }

  /** Se contó el cajón al cerrar. */
  contar(sesionCajaId: string, contadoCentavos: number): void {
    this.#reemplazar({ ...this.#caja(sesionCajaId), contadoCentavos: BigInt(contadoCentavos) });
  }

  /**
   * Se cobró una venta. `pagos` es lo que entró por cada método CON la propina y SIN el
   * cambio devuelto; `propina`, por el método con que se pagó.
   */
  cobro(cobro: {
    readonly referencia: string;
    readonly ventaId: string;
    readonly sesionCajaId: string;
    readonly ventaCentavos: number;
    readonly pagos: Readonly<Record<string, number>>;
    readonly propina?: Readonly<Record<string, number>>;
  }): void {
    const pagos = Object.entries(cobro.pagos).filter(([, v]) => v !== 0);
    // Los métodos sin columna en la vista: con su nombre si fue el único, `otro` si se
    // mezcló. Es la misma regla que `pagosDe`, del lado del libro.
    const normalizados: Record<string, bigint> = {};
    for (const [metodo, monto] of pagos) {
      const clave = POR_COLUMNA.includes(metodo) || pagos.length === 1 ? metodo : 'otro';
      normalizados[clave] = (normalizados[clave] ?? 0n) + BigInt(monto);
    }
    this.#cobros.push({
      referencia: cobro.referencia,
      ventaId: cobro.ventaId,
      sesionCajaId: cobro.sesionCajaId,
      ventaCentavos: BigInt(cobro.ventaCentavos),
      pagos: normalizados,
      propinaPorMetodo: Object.fromEntries(
        Object.entries(cobro.propina ?? {}).map(([m, v]) => [m, BigInt(v)]),
      ),
    });
  }

  pasivo(concepto: string, centavosDelPasivo: number): void {
    this.#pasivos.push({ concepto, centavos: BigInt(centavosDelPasivo) });
  }

  comision(profesional: string, baseCentavos: number, puntosBase: number): void {
    this.#comisiones.push({ profesional, baseCentavos: BigInt(baseCentavos), puntosBase });
  }

  /** La existencia de un insumo al empezar a moverlo; `despues` se anota al final. */
  existenciaAntes(producto: string, antes: number): void {
    this.#inventario.set(producto, { producto, antes, despues: antes });
  }

  existenciaDespues(producto: string, despues: number): void {
    const anotada = this.#inventario.get(producto);
    if (anotada === undefined) throw new Error(`No se anotó la existencia inicial de ${producto}.`);
    this.#inventario.set(producto, { ...anotada, despues });
  }

  get productosVigilados(): readonly string[] {
    return [...this.#inventario.keys()];
  }

  libro(): LibroDelDia {
    return {
      cajas: [...this.#cajas],
      cobros: [...this.#cobros],
      pasivos: [...this.#pasivos],
      comisiones: [...this.#comisiones],
      inventario: [...this.#inventario.values()],
    };
  }
}

/**
 * EL DINERO CUADRA AL CENTAVO, o la prueba dice exactamente dónde no.
 *
 * Se lee con la pestaña de quien ve costos y caja (dueño o gerente). Devuelve la
 * conciliación para que el día la anote en su informe —el total cobrado y conciliado
 * va al reporte de la 2.4—.
 */
export async function exigirQueCuadre(
  page: Page,
  libro: Libro,
  lecturas: LecturasDelGiro = {},
): Promise<Conciliacion> {
  for (const producto of libro.productosVigilados) {
    libro.existenciaDespues(producto, await existenciaDe(page, producto));
  }
  const servidor = await leerElServidor(page, lecturas);
  const resultado = conciliarElDia(libro.libro(), servidor);
  const { resumen } = resultado;
  test.info().annotations.push({
    type: 'conciliación',
    description:
      `ventas ${enPesosDeCentavos(resumen.ventasCentavos)} · propinas ${enPesosDeCentavos(resumen.propinasCentavos)} · ` +
      `cobrado ${enPesosDeCentavos(resumen.cobradoCentavos)} · efectivo esperado ${enPesosDeCentavos(resumen.esperadoCentavos)} · ` +
      `diferencia de arqueo ${enPesosDeCentavos(resumen.diferenciaCentavos)} · ` +
      `${String(servidor.ventas.length)} ventas, ${String(servidor.cajas.length)} cajas · ` +
      (resultado.hallazgos.length === 0
        ? 'CUADRA'
        : `${String(resultado.hallazgos.length)} hallazgos`),
  });
  expect(resultado.hallazgos, `EL DINERO NO CUADRA AL CENTAVO:\n${explicar(resultado)}`).toEqual(
    [],
  );
  return resultado;
}
