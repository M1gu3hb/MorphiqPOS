/**
 * LA CONCILIACIÓN DEL DÍA, al centavo (bloque D.2 de la 2.4).
 *
 * Hasta la 2.4 cada suite cobraba UNA venta sin propina en un corte que cuadraba, y lo
 * comprobaba con su propia aritmética escrita en la prueba. Un negocio vive ocho horas:
 * cobra en efectivo, con tarjeta y mixto, recibe propina tecleada y por porcentaje,
 * devuelve, retira, gasta, fía y abona, y a veces con dos cajas abiertas. Este módulo es
 * el ÚNICO lugar donde se decide si eso cuadra, y lo usan los cinco días completos.
 *
 * ── Tres fuentes, y por qué tres ──────────────────────────────────────────────
 * El LIBRO es lo que la prueba hizo, anotado paso a paso (lo que la pantalla dijo que
 * cobraba, cómo se pagó, cuánto se contó). El SERVIDOR son sus registros crudos: las
 * ventas con sus pagos por método, los movimientos de cada caja, sus cortes, los
 * pasivos, las comisiones y el ledger de inventario. Conciliar el servidor contra sí
 * mismo no prueba nada —un error que entra en dos tablas cuadra igual—; conciliarlo
 * contra lo que se hizo sí. Y además se exige su coherencia interna, porque un corte que
 * suma bien con un esperado mal calculado es justo el descuadre que el dueño encuentra a
 * las doce de la noche.
 *
 * ── Lo que se exige, con el nombre de la regla ────────────────────────────────
 *   pagos-por-metodo   Σ pagos de la venta = venta + propina, y cada método al centavo.
 *   propina-fuera      la propina NO está en la venta, ni en la utilidad ni en el costo.
 *   propina-exacta     el desglose de la propina por método es el que se cobró, jamás un
 *                      prorrateo.
 *   venta-sin-anotar   ninguna venta del día que la prueba no hizo.
 *   efectivo-esperado  esperado = fondo + movimientos de efectivo, por las dos cuentas,
 *                      en CADA caja.
 *   caja-sin-anotar    ninguna sesión de caja que la prueba no abrió.
 *   arqueo             la diferencia es contado − esperado: sobrante y faltante también.
 *   pasivo             lo que no es del negocio está en su ledger, no en ventas.
 *   comision           la comisión causada es la regla de su profesional.
 *   inventario         cada unidad que bajó tiene su venta, merma, ajuste o consumo.
 *
 * Todo en `bigint` de centavos: un `number` con `0.1 + 0.2` no cuadra al centavo.
 */

/** Centavos por método de pago: `{ efectivo: 15000n, tarjeta: 8250n }`. */
export type PorMetodo = Readonly<Record<string, bigint>>;

/** Un cobro tal como lo hizo la prueba. */
export interface CobroDelLibro {
  /** Para el mensaje: «la mesa 4», «el corte de 2.40 m». */
  readonly referencia: string;
  /** La venta en el servidor. La prueba la conoce: es la que apareció al cobrar. */
  readonly ventaId: string;
  /** La sesión de caja que lo cobró. Su efectivo entra a ESE cajón y a ningún otro. */
  readonly sesionCajaId: string;
  /** Lo que se vendió: el total de la cuenta SIN propina. */
  readonly ventaCentavos: bigint;
  /** Lo que entró por cada método, propina incluida y sin el cambio que se devolvió. */
  readonly pagos: PorMetodo;
  /** La propina, por el método con que se pagó. Vacío si no hubo. */
  readonly propinaPorMetodo: PorMetodo;
}

/** Un movimiento del cajón que no es un cobro: con su SIGNO (+ entra, − sale). */
export interface MovimientoDelLibro {
  readonly concepto: string;
  readonly efectivoCentavos: bigint;
}

/** Una caja que la prueba abrió: su fondo, lo que le pasó y lo que se contó al cerrar. */
export interface CajaDelLibro {
  /** Para el mensaje: «la caja de Diana». */
  readonly referencia: string;
  readonly sesionCajaId: string;
  readonly fondoCentavos: bigint;
  readonly movimientos: readonly MovimientoDelLibro[];
  /** Lo que se contó en el arqueo; `null` si la caja no llegó a contarse. */
  readonly contadoCentavos: bigint | null;
}

export interface PasivoDelLibro {
  readonly concepto: string;
  readonly centavos: bigint;
}

export interface ComisionDelLibro {
  readonly profesional: string;
  /**
   * La base sobre la que corre la regla: lo cobrado del servicio sin IVA ni propina,
   * después del descuento (`02-DINERO-Y-CAJA §7.2`, preguntas 1 y 2).
   */
  readonly baseCentavos: bigint;
  /** La regla de esa profesional, en puntos base (4000 = 40 %). */
  readonly puntosBase: number;
}

export interface ExistenciaDelLibro {
  readonly producto: string;
  readonly antes: number;
  readonly despues: number;
}

/** LO QUE LA PRUEBA HIZO. */
export interface LibroDelDia {
  readonly cajas: readonly CajaDelLibro[];
  readonly cobros: readonly CobroDelLibro[];
  readonly pasivos: readonly PasivoDelLibro[];
  readonly comisiones: readonly ComisionDelLibro[];
  readonly inventario: readonly ExistenciaDelLibro[];
}

export interface VentaDelServidor {
  readonly id: string;
  readonly folio: string;
  readonly totalCentavos: bigint;
  /** Lo cobrado por método, propina incluida (`ordenes_pagos_resumen`). */
  readonly pagos: PorMetodo;
  readonly propinaPorMetodo: PorMetodo;
  /** `null` para quien no ve costos. */
  readonly costoCentavos: bigint | null;
  readonly utilidadCentavos: bigint | null;
}

/** Una sesión de caja del servidor: su corte y los movimientos de su cajón. */
export interface CajaDelServidor {
  readonly sesionCajaId: string;
  readonly folio: string;
  readonly fondoCentavos: bigint;
  readonly esperadoCentavos: bigint;
  readonly contadoCentavos: bigint | null;
  /** Los movimientos de EFECTIVO de la sesión, con su signo, apertura incluida. */
  readonly movimientos: readonly { readonly tipo: string; readonly montoCentavos: bigint }[];
}

/** LO QUE DICE EL SERVIDOR, ya en centavos. Sólo lo del día de la prueba. */
export interface ServidorDelDia {
  readonly ventas: readonly VentaDelServidor[];
  readonly cajas: readonly CajaDelServidor[];
  readonly pasivos: readonly PasivoDelLibro[];
  readonly comisiones: readonly { readonly profesional: string; readonly centavos: bigint }[];
  readonly movimientosDeInventario: readonly {
    readonly producto: string;
    /** Negativa cuando salió. */
    readonly cantidad: number;
    readonly origen: string;
  }[];
}

export interface Hallazgo {
  readonly regla: string;
  readonly detalle: string;
}

export interface Conciliacion {
  readonly hallazgos: readonly Hallazgo[];
  /** Para el reporte: lo cobrado y lo que se concilió, en centavos. */
  readonly resumen: {
    readonly ventasCentavos: bigint;
    readonly propinasCentavos: bigint;
    readonly cobradoCentavos: bigint;
    readonly esperadoCentavos: bigint;
    readonly diferenciaCentavos: bigint;
  };
}

/**
 * Los orígenes que justifican que el inventario BAJE: los `tipo` de `movimientos_stock`
 * con cantidad negativa (`movimiento_stock_signo_coherente`, migración 118). La venta, la
 * merma, el ajuste, el consumo —interno o de un servicio—, el traspaso y lo que sale
 * hacia el proveedor, en garantía o en renta. Cualquier otro es un hueco.
 */
export const ORIGENES_QUE_BAJAN: readonly string[] = [
  'salida_venta',
  'merma',
  'ajuste',
  'salida_consumo_interno',
  'consumo_servicio',
  'traspaso_salida',
  'devolucion_proveedor',
  'garantia_proveedor',
  'renta_salida',
];

const suma = (valores: Iterable<bigint>): bigint => {
  let total = 0n;
  for (const v of valores) total += v;
  return total;
};

const sumaPorMetodo = (porMetodo: PorMetodo): bigint => suma(Object.values(porMetodo));

const pesos = (centavos: bigint): string => {
  const signo = centavos < 0n ? '−' : '';
  const abs = centavos < 0n ? -centavos : centavos;
  return `${signo}$${String(abs / 100n)}.${String(abs % 100n).padStart(2, '0')}`;
};

/** Los métodos con importe, sin los ceros: `{efectivo: 0n}` y `{}` son el mismo pago. */
function sinCeros(porMetodo: PorMetodo): Record<string, bigint> {
  return Object.fromEntries(Object.entries(porMetodo).filter(([, v]) => v !== 0n));
}

function mismosMetodos(a: PorMetodo, b: PorMetodo): boolean {
  const x = sinCeros(a);
  const y = sinCeros(b);
  const claves = new Set([...Object.keys(x), ...Object.keys(y)]);
  for (const clave of claves) if ((x[clave] ?? 0n) !== (y[clave] ?? 0n)) return false;
  return true;
}

const describir = (porMetodo: PorMetodo): string =>
  Object.entries(sinCeros(porMetodo))
    .map(([m, v]) => `${m} ${pesos(v)}`)
    .join(' + ') || 'nada';

/** Un cobro contra su venta: total, pagos, propina, utilidad. */
function conciliarCobro(cobro: CobroDelLibro, venta: VentaDelServidor): Hallazgo[] {
  const salida: Hallazgo[] = [];
  const quien = `${cobro.referencia} (${venta.folio})`;
  const propina = sumaPorMetodo(cobro.propinaPorMetodo);
  if (venta.totalCentavos !== cobro.ventaCentavos) {
    salida.push({
      regla: 'propina-fuera',
      detalle: `${quien}: el servidor guardó una venta de ${pesos(venta.totalCentavos)} y se vendieron ${pesos(cobro.ventaCentavos)}${propina > 0n ? ` (más ${pesos(propina)} de propina, que no es venta)` : ''}.`,
    });
  }
  const pagado = sumaPorMetodo(venta.pagos);
  const propinaServidor = sumaPorMetodo(venta.propinaPorMetodo);
  if (pagado !== venta.totalCentavos + propinaServidor) {
    salida.push({
      regla: 'pagos-por-metodo',
      detalle: `${quien}: los pagos suman ${pesos(pagado)} y la venta más su propina son ${pesos(venta.totalCentavos + propinaServidor)}.`,
    });
  }
  if (!mismosMetodos(venta.pagos, cobro.pagos)) {
    salida.push({
      regla: 'pagos-por-metodo',
      detalle: `${quien}: se cobró ${describir(cobro.pagos)} y el servidor registró ${describir(venta.pagos)}.`,
    });
  }
  if (!mismosMetodos(venta.propinaPorMetodo, cobro.propinaPorMetodo)) {
    salida.push({
      regla: 'propina-exacta',
      detalle: `${quien}: la propina se pagó ${describir(cobro.propinaPorMetodo)} y el servidor la desglosa ${describir(venta.propinaPorMetodo)}. El desglose es el que se cobró, jamás un prorrateo.`,
    });
  }
  if (
    venta.costoCentavos !== null &&
    venta.utilidadCentavos !== null &&
    venta.costoCentavos + venta.utilidadCentavos !== venta.totalCentavos
  ) {
    salida.push({
      regla: 'propina-fuera',
      detalle: `${quien}: costo ${pesos(venta.costoCentavos)} + utilidad ${pesos(venta.utilidadCentavos)} no es la venta de ${pesos(venta.totalCentavos)}: algo que no es venta entró al margen.`,
    });
  }
  return salida;
}

function conciliarVentas(libro: LibroDelDia, servidor: ServidorDelDia): Hallazgo[] {
  const salida: Hallazgo[] = [];
  const porId = new Map(servidor.ventas.map((v) => [v.id, v]));
  const anotadas = new Set<string>();
  for (const cobro of libro.cobros) {
    anotadas.add(cobro.ventaId);
    const venta = porId.get(cobro.ventaId);
    if (venta === undefined) {
      salida.push({
        regla: 'pagos-por-metodo',
        detalle: `${cobro.referencia}: se cobró y el servidor no tiene esa venta entre las del día.`,
      });
      continue;
    }
    salida.push(...conciliarCobro(cobro, venta));
  }
  for (const venta of servidor.ventas) {
    if (!anotadas.has(venta.id)) {
      salida.push({
        regla: 'venta-sin-anotar',
        detalle: `La venta ${venta.folio} de ${pesos(venta.totalCentavos)} está en el servidor y la prueba no la hizo.`,
      });
    }
  }
  return salida;
}

/** El efectivo que el libro dice que debería haber en ESA caja. */
export function efectivoEsperadoDelLibro(libro: LibroDelDia, caja: CajaDelLibro): bigint {
  const cobrado = suma(
    libro.cobros
      .filter((c) => c.sesionCajaId === caja.sesionCajaId)
      .map((c) => c.pagos['efectivo'] ?? 0n),
  );
  return caja.fondoCentavos + cobrado + suma(caja.movimientos.map((m) => m.efectivoCentavos));
}

function conciliarUnaCaja(
  libro: LibroDelDia,
  caja: CajaDelLibro,
  delServidor: CajaDelServidor,
): Hallazgo[] {
  const salida: Hallazgo[] = [];
  const quien = `${caja.referencia} (${delServidor.folio})`;
  const delLedger = suma(delServidor.movimientos.map((m) => m.montoCentavos));
  if (delServidor.esperadoCentavos !== delLedger) {
    salida.push({
      regla: 'efectivo-esperado',
      detalle: `${quien}: el corte dice que debería haber ${pesos(delServidor.esperadoCentavos)} y sus movimientos de efectivo, fondo incluido, suman ${pesos(delLedger)}.`,
    });
  }
  if (delServidor.fondoCentavos !== caja.fondoCentavos) {
    salida.push({
      regla: 'efectivo-esperado',
      detalle: `${quien}: se abrió con ${pesos(caja.fondoCentavos)} y el corte trae un fondo de ${pesos(delServidor.fondoCentavos)}.`,
    });
  }
  const esperado = efectivoEsperadoDelLibro(libro, caja);
  if (delServidor.esperadoCentavos !== esperado) {
    salida.push({
      regla: 'efectivo-esperado',
      detalle: `${quien}: por lo que se hizo debería haber ${pesos(esperado)} (fondo + efectivo cobrado + movimientos) y el corte espera ${pesos(delServidor.esperadoCentavos)}.`,
    });
  }
  if (caja.contadoCentavos !== null && delServidor.contadoCentavos !== caja.contadoCentavos) {
    salida.push({
      regla: 'arqueo',
      detalle: `${quien}: se contaron ${pesos(caja.contadoCentavos)} y el corte guardó ${delServidor.contadoCentavos === null ? 'nada' : pesos(delServidor.contadoCentavos)}.`,
    });
  }
  return salida;
}

function conciliarCajas(libro: LibroDelDia, servidor: ServidorDelDia): Hallazgo[] {
  const salida: Hallazgo[] = [];
  const porSesion = new Map(servidor.cajas.map((c) => [c.sesionCajaId, c]));
  for (const caja of libro.cajas) {
    const delServidor = porSesion.get(caja.sesionCajaId);
    if (delServidor === undefined) {
      salida.push({
        regla: 'arqueo',
        detalle: `${caja.referencia}: se abrió y el servidor no tiene esa sesión de caja.`,
      });
      continue;
    }
    salida.push(...conciliarUnaCaja(libro, caja, delServidor));
  }
  const abiertas = new Set(libro.cajas.map((c) => c.sesionCajaId));
  for (const caja of servidor.cajas) {
    if (!abiertas.has(caja.sesionCajaId)) {
      salida.push({
        regla: 'caja-sin-anotar',
        detalle: `La caja ${caja.folio} con fondo de ${pesos(caja.fondoCentavos)} está en el servidor y la prueba no la abrió.`,
      });
    }
  }
  return salida;
}

function conciliarPasivos(libro: LibroDelDia, servidor: ServidorDelDia): Hallazgo[] {
  const salida: Hallazgo[] = [];
  const disponibles = [...servidor.pasivos];
  for (const pasivo of libro.pasivos) {
    const i = disponibles.findIndex(
      (p) => p.concepto === pasivo.concepto && p.centavos === pasivo.centavos,
    );
    if (i === -1) {
      salida.push({
        regla: 'pasivo',
        detalle: `${pasivo.concepto} de ${pesos(pasivo.centavos)} no está en el ledger de pasivos: lo que no es del negocio no puede quedarse sin dueño.`,
      });
      continue;
    }
    disponibles.splice(i, 1);
  }
  return salida;
}

/** La regla en puntos base sobre la base, redondeada al centavo (la mitad, hacia arriba). */
export function comisionDeLaRegla(baseCentavos: bigint, puntosBase: number): bigint {
  return (baseCentavos * BigInt(puntosBase) + 5_000n) / 10_000n;
}

function conciliarComisiones(libro: LibroDelDia, servidor: ServidorDelDia): Hallazgo[] {
  const esperadas = new Map<string, bigint>();
  for (const c of libro.comisiones) {
    esperadas.set(
      c.profesional,
      (esperadas.get(c.profesional) ?? 0n) + comisionDeLaRegla(c.baseCentavos, c.puntosBase),
    );
  }
  const causadas = new Map<string, bigint>();
  for (const c of servidor.comisiones) {
    causadas.set(c.profesional, (causadas.get(c.profesional) ?? 0n) + c.centavos);
  }
  const salida: Hallazgo[] = [];
  for (const quien of new Set([...esperadas.keys(), ...causadas.keys()])) {
    const esperada = esperadas.get(quien) ?? 0n;
    const causada = causadas.get(quien) ?? 0n;
    if (esperada !== causada) {
      salida.push({
        regla: 'comision',
        detalle: `${quien}: su regla da ${pesos(esperada)} de comisión y el servidor causó ${pesos(causada)}.`,
      });
    }
  }
  return salida;
}

function conciliarInventario(libro: LibroDelDia, servidor: ServidorDelDia): Hallazgo[] {
  const salida: Hallazgo[] = [];
  for (const mov of servidor.movimientosDeInventario) {
    if (mov.cantidad < 0 && !ORIGENES_QUE_BAJAN.includes(mov.origen)) {
      salida.push({
        regla: 'inventario',
        detalle: `«${mov.producto}» bajó ${String(-mov.cantidad)} por «${mov.origen}», que no es venta, merma, ajuste ni consumo.`,
      });
    }
  }
  for (const existencia of libro.inventario) {
    const bajo = existencia.antes - existencia.despues;
    const justificado = -servidor.movimientosDeInventario
      .filter((m) => m.producto === existencia.producto)
      .reduce((total, m) => total + m.cantidad, 0);
    if (Math.abs(bajo - justificado) > 1e-9) {
      salida.push({
        regla: 'inventario',
        detalle: `«${existencia.producto}» pasó de ${String(existencia.antes)} a ${String(existencia.despues)} y el ledger justifica ${String(justificado)}: ${String(bajo - justificado)} sin dueño.`,
      });
    }
  }
  return salida;
}

/** EL ÚNICO lugar donde se decide si el día cuadra. */
export function conciliarElDia(libro: LibroDelDia, servidor: ServidorDelDia): Conciliacion {
  const hallazgos = [
    ...conciliarVentas(libro, servidor),
    ...conciliarCajas(libro, servidor),
    ...conciliarPasivos(libro, servidor),
    ...conciliarComisiones(libro, servidor),
    ...conciliarInventario(libro, servidor),
  ];
  const esperado = suma(servidor.cajas.map((c) => c.esperadoCentavos));
  return {
    hallazgos,
    resumen: {
      ventasCentavos: suma(servidor.ventas.map((v) => v.totalCentavos)),
      propinasCentavos: suma(servidor.ventas.map((v) => sumaPorMetodo(v.propinaPorMetodo))),
      cobradoCentavos: suma(servidor.ventas.map((v) => sumaPorMetodo(v.pagos))),
      esperadoCentavos: esperado,
      diferenciaCentavos: suma(
        servidor.cajas.map((c) =>
          c.contadoCentavos === null ? 0n : c.contadoCentavos - c.esperadoCentavos,
        ),
      ),
    },
  };
}

/** Los hallazgos, legibles, para el mensaje de una prueba que falla. */
export function explicar(conciliacion: Conciliacion): string {
  return conciliacion.hallazgos.map((h) => `· [${h.regla}] ${h.detalle}`).join('\n');
}

export { pesos as enPesosDeCentavos };
