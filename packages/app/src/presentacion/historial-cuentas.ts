import { centavos, porCantidad, repartirPorPesos } from '@morphiqpos/domain/dinero';
import {
  calcularConsumo,
  lineasDelCanal,
  recetaConOpciones,
  type LineaParaConsumo,
  type MovimientoPlaneado,
} from '@morphiqpos/domain/inventario';
import { calcularTotales, evaluarDescuento, type TotalesOrden } from '@morphiqpos/domain/venta';

import {
  agruparEnComandas,
  resolverEstacion,
  type EstacionResuelta,
} from '../restaurante/estaciones.ts';
import { idDeterminista, type Azar } from './historial-azar.ts';
import { planearCobro, type CobroPlaneado } from './historial-cobro.ts';
import { diaDeLaSemana, instanteLocal, minutosDe } from './historial-fechas.ts';
import type {
  ClaseDePlatillo,
  ContextoDeHistorial,
  EmpleadoRef,
  MesaRef,
  ProductoVendible,
} from './historial-tipos.ts';

/**
 * Las cuentas de un día: quién se sentó, qué pidió, cuándo salió cada plato, cuánto pagó.
 *
 * Todo PURO y determinista: la misma semilla y el mismo día dan las mismas cuentas. Las horas
 * respetan el orden en que ocurren las cosas de verdad —la comanda sale antes de que llegue el
 * plato, el plato llega antes de pedir la cuenta, la cuenta se pide antes de cobrar— y dos
 * cuentas jamás ocupan la misma mesa a la vez. Los importes salen de las mismas funciones
 * puras que usa el cobro (`calcularTotales`, `repartirPagos`, `calcularConsumo`), así que el
 * historial suma igual que sumaría la venta real.
 */

const PRIMERA_CUENTA = minutosDe(13, 5);
const ULTIMA_CUENTA_EN_MESA = minutosDe(21, 10);
const ULTIMA_CUENTA_PARA_LLEVAR = minutosDe(22, 10);
/** A esta hora el turno cambia de cajero y se hace el corte de media jornada. */
export const MINUTO_DEL_CORTE_DE_TURNO = minutosDe(17, 30);
const LIMITE_DE_LA_VALORACION = minutosDe(23, 50);

const CUENTAS_POR_DIA: Readonly<Record<number, readonly [number, number]>> = {
  0: [20, 28],
  1: [12, 18],
  2: [13, 20],
  3: [14, 21],
  4: [17, 25],
  5: [26, 34],
  6: [28, 35],
};

const COMENSALES = [
  { valor: 1, peso: 12 },
  { valor: 2, peso: 38 },
  { valor: 3, peso: 18 },
  { valor: 4, peso: 22 },
  { valor: 5, peso: 6 },
  { valor: 6, peso: 4 },
] as const;

const NOMBRES_PARA_LLEVAR = [
  'Carlos',
  'Mariana',
  'Jorge',
  'Fernanda',
  'Luis',
  'Daniela',
  'Ricardo',
  'Paola',
  'Hugo',
  'Valeria',
  'Sergio',
  'Andrea',
  'Iván',
  'Karla',
  'Raúl',
  'Diana',
] as const;

const MOTIVOS_DE_DESCUENTO = [
  'Cortesía de la casa por cumpleaños',
  'Cliente frecuente',
  'Compensación por demora en cocina',
  'Promoción de la semana',
] as const;

const COMENTARIOS: Readonly<Record<number, readonly string[]>> = {
  5: ['Todo delicioso y la atención, excelente.', 'Volveremos pronto, gracias.', 'Muy buen sazón.'],
  4: ['Buena comida y rápido el servicio.', 'Todo bien, solo tardó un poco la bebida.'],
  3: ['Está bien, sin más.'],
  2: ['La comida llegó tibia.'],
  1: ['Esperamos mucho y no avisaron.'],
};

const EMOJIS: Readonly<Record<number, string>> = { 1: '😡', 2: '😕', 3: '😐', 4: '🙂', 5: '🤩' };

const MINUTO = 60_000;
const MARGEN_ENTRE_COMENSALES = 4 * MINUTO;
const PROBABILIDAD_DE_DESCUENTO = 0.06;
const DESCUENTO_MINIMO_CENTAVOS = 500n;

export interface LineaPlaneada {
  readonly id: string;
  readonly producto: ProductoVendible;
  readonly cantidad: number;
  readonly orden: number;
  readonly subtotalCentavos: bigint;
  readonly descuentoCentavos: bigint;
  readonly totalCentavos: bigint;
  /** El costo de TODA la línea (costo unitario × cantidad), no el unitario. */
  readonly costoCentavos: bigint;
}

export interface ComandaPlaneada {
  readonly id: string;
  readonly area: 'cocina' | 'barra';
  readonly estacion: EstacionResuelta;
  readonly items: readonly { readonly lineaId: string; readonly listoEn: Date }[];
  readonly marchadaEn: Date;
  readonly iniciadaEn: Date;
  readonly listaEn: Date;
  readonly entregadaEn: Date;
}

export interface DescuentoPlaneado {
  readonly totalCentavos: bigint;
  readonly baseCentavos: bigint;
  readonly motivo: string;
  /** `null` si cupo en el tope del cajero; si no, el supervisor que lo firmó. */
  readonly autorizadoPor: EmpleadoRef | null;
}

export interface SatisfaccionPlaneada {
  readonly puntaje: number;
  readonly emoji: string;
  readonly comentario: string | null;
  readonly en: Date;
}

export interface CuentaPlaneada {
  readonly id: string;
  readonly canal: 'aqui' | 'llevar';
  readonly mesa: MesaRef | null;
  readonly personas: number;
  readonly nombrePedido: string | null;
  readonly mesero: EmpleadoRef;
  readonly cajero: EmpleadoRef;
  readonly abiertaEn: Date;
  readonly precuentaEn: Date | null;
  readonly cobradaEn: Date;
  readonly terminaEn: Date;
  readonly lineas: readonly LineaPlaneada[];
  readonly comandas: readonly ComandaPlaneada[];
  readonly descuento: DescuentoPlaneado | null;
  readonly totales: TotalesOrden;
  readonly cobro: CobroPlaneado;
  readonly satisfaccion: SatisfaccionPlaneada | null;
  readonly consumo: readonly MovimientoPlaneado[];
}

export interface ParametrosDeCuentas {
  readonly ctx: ContextoDeHistorial;
  readonly dia: string;
  readonly azar: Azar;
  /** Los platillos que ese día se pueden vender (ver `platillosConConsumoValido`). */
  readonly productos: readonly ProductoVendible[];
}

interface Ocupacion {
  readonly mesaId: string;
  readonly desde: number;
  readonly hasta: number;
}

interface Llegada {
  readonly esMesa: boolean;
  readonly inicio: number;
}

function sumarMinutos(instante: Date, minutos: number): Date {
  return new Date(instante.getTime() + minutos * MINUTO);
}

/** Un número de la normal estándar sin `Math.random`: Box-Muller sobre el azar del día. */
function normal(azar: Azar): number {
  const u1 = 1 - azar.siguiente();
  const u2 = azar.siguiente();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/** Dos olas: la comida, hacia las tres, y la cena, hacia las ocho y media. */
function minutoDeLlegada(azar: Azar, ultimo: number): number {
  const centro = azar.probabilidad(0.55) ? minutosDe(14, 45) : minutosDe(20, 30);
  const minuto = Math.round(centro + normal(azar) * 55);
  return Math.min(Math.max(minuto, PRIMERA_CUENTA), ultimo);
}

/** Cuántas cuentas tiene un día, según el día de la semana: más el viernes y el sábado. */
export function cuentasDelDia(azar: Azar, dia: string): number {
  const [minimo, maximo] = CUENTAS_POR_DIA[diaDeLaSemana(dia)] ?? [14, 22];
  return azar.entero(minimo, maximo);
}

function elegirPlatillo(azar: Azar, lista: readonly ProductoVendible[]): ProductoVendible {
  return azar.ponderado(lista.map((p) => ({ valor: p, peso: p.popularidad })));
}

function deLaClase(
  productos: readonly ProductoVendible[],
  clase: ClaseDePlatillo,
): readonly ProductoVendible[] {
  return productos.filter((p) => p.clase === clase);
}

/** Qué pidió la mesa: un platillo por persona, casi siempre algo de beber, a veces entrada y postre. */
function pedidoDeMesa(
  azar: Azar,
  productos: readonly ProductoVendible[],
  personas: number,
): ProductoVendible[] {
  const entradas = deLaClase(productos, 'entrada');
  const principales = deLaClase(productos, 'principal');
  const bebidas = deLaClase(productos, 'bebida');
  const postres = deLaClase(productos, 'postre');
  const pedido: ProductoVendible[] = [];
  if (entradas.length > 0 && azar.probabilidad(0.35)) pedido.push(elegirPlatillo(azar, entradas));
  for (let i = 0; i < personas; i += 1) {
    if (principales.length > 0 && azar.probabilidad(0.92)) {
      pedido.push(elegirPlatillo(azar, principales));
    }
    if (bebidas.length > 0 && azar.probabilidad(0.85)) pedido.push(elegirPlatillo(azar, bebidas));
  }
  if (postres.length > 0 && azar.probabilidad(0.22)) pedido.push(elegirPlatillo(azar, postres));
  return pedido.length > 0 ? pedido : [elegirPlatillo(azar, productos)];
}

function pedidoParaLlevar(azar: Azar, productos: readonly ProductoVendible[]): ProductoVendible[] {
  const principales = deLaClase(productos, 'principal');
  const bebidas = deLaClase(productos, 'bebida');
  const pedido: ProductoVendible[] = [];
  const platos = azar.entero(1, 3);
  for (let i = 0; i < platos; i += 1) {
    pedido.push(elegirPlatillo(azar, principales.length > 0 ? principales : productos));
  }
  if (bebidas.length > 0 && azar.probabilidad(0.5)) pedido.push(elegirPlatillo(azar, bebidas));
  return pedido;
}

/** Lo que se repite se junta en una sola línea con su cantidad. */
function juntarRenglones(
  azar: Azar,
  pedido: readonly ProductoVendible[],
): { producto: ProductoVendible; cantidad: number }[] {
  const cantidades = new Map<string, { producto: ProductoVendible; cantidad: number }>();
  for (const producto of pedido) {
    const unidades = 1 + (producto.clase === 'bebida' && azar.probabilidad(0.12) ? 1 : 0);
    const antes = cantidades.get(producto.id)?.cantidad ?? 0;
    cantidades.set(producto.id, { producto, cantidad: antes + unidades });
  }
  return [...cantidades.values()];
}

function minutosDePreparacion(azar: Azar, producto: ProductoVendible): number {
  const base = producto.minutosPreparacion ?? (producto.areaPreparacion === 'barra' ? 4 : 14);
  return Math.max(2, base + azar.entero(-2, 3));
}

/** Las horas de cocina de cada comanda, a partir del instante en que se marchó el pedido. */
function cronogramaDeCocina(
  azar: Azar,
  ctx: ContextoDeHistorial,
  lineas: readonly LineaPlaneada[],
  marchadaEn: Date,
  ordenId: string,
): readonly ComandaPlaneada[] {
  const preparadas = lineas
    .filter((l) => ['cocina', 'barra', 'ambos'].includes(l.producto.areaPreparacion))
    .map((linea) => ({
      linea,
      areaPreparacion: linea.producto.areaPreparacion,
      estacion: resolverEstacion(linea.producto.estacionDeCategoriaId, ctx.estaciones),
    }));
  return agruparEnComandas(preparadas).map((grupo, k) => {
    const iniciadaEn = sumarMinutos(marchadaEn, azar.entero(1, 3));
    const items = grupo.lineas.map((p) => ({
      lineaId: p.linea.id,
      minutos: minutosDePreparacion(azar, p.linea.producto),
    }));
    const listaEn = sumarMinutos(iniciadaEn, Math.max(...items.map((i) => i.minutos)));
    return {
      id: idDeterminista(ordenId, 'comanda', k),
      area: grupo.area,
      estacion: grupo.estacion,
      items: items.map((i) => ({
        lineaId: i.lineaId,
        listoEn: sumarMinutos(iniciadaEn, i.minutos),
      })),
      marchadaEn,
      iniciadaEn,
      listaEn,
      entregadaEn: sumarMinutos(listaEn, azar.entero(1, 3)),
    };
  });
}

function cabeEnElTope(ctx: ContextoDeHistorial, base: bigint, descuento: bigint): boolean {
  const veredicto = evaluarDescuento({
    baseCentavos: base,
    descuentoCentavos: descuento,
    tope: ctx.topeDelCajero,
  });
  return veredicto.veredicto === 'libre';
}

/**
 * Un descuento ocasional, en pesos enteros. Si pasa del tope del cajero lo firma un supervisor
 * distinto de quien cobra —la base lo exige—; sin supervisor disponible, no hay descuento.
 */
function descuentoOcasional(
  azar: Azar,
  ctx: ContextoDeHistorial,
  cajero: EmpleadoRef,
  base: bigint,
): DescuentoPlaneado | null {
  if (!azar.probabilidad(PROBABILIDAD_DE_DESCUENTO)) return null;
  const porcentaje = BigInt(azar.elegir([5, 10, 10, 15]));
  const monto = ((base * porcentaje) / 10_000n) * 100n;
  const motivo = azar.elegir(MOTIVOS_DE_DESCUENTO);
  if (monto < DESCUENTO_MINIMO_CENTAVOS || monto >= base) return null;
  if (cabeEnElTope(ctx, base, monto)) {
    return { totalCentavos: monto, baseCentavos: base, motivo, autorizadoPor: null };
  }
  const supervisor = ctx.gerentes.find((g) => g.id !== cajero.id);
  return supervisor === undefined
    ? null
    : { totalCentavos: monto, baseCentavos: base, motivo, autorizadoPor: supervisor };
}

/** La traducción de una línea vendida al contrato de consumo, igual que `planearConsumo`. */
export function lineaParaConsumo(
  ctx: ContextoDeHistorial,
  ordenId: string,
  canal: string,
  producto: ProductoVendible,
  cantidad: string,
  lineaId: string,
): LineaParaConsumo | null {
  const comun = {
    organizacionId: ctx.organizacionId,
    almacenId: ctx.almacenId,
    ordenId,
    lineaId,
    cantidad,
    permiteVentaSinStock: producto.permiteVentaSinStock,
  };
  if (producto.estrategiaConsumo === 'sku') {
    if (producto.insumoId === null || producto.unidadBaseInsumo === null) return null;
    return {
      ...comun,
      estrategiaConsumo: 'sku',
      insumoId: producto.insumoId,
      unidadVenta: producto.unidadVenta,
      unidadBase: producto.unidadBaseInsumo,
    };
  }
  if (producto.estrategiaConsumo !== 'receta') return null;
  const ingredientes = recetaConOpciones(lineasDelCanal(producto.receta, canal), []);
  if (ingredientes.length === 0) return null;
  return {
    ...comun,
    estrategiaConsumo: 'receta',
    receta: ingredientes.map((i) => ({
      insumoId: i.insumoId,
      cantidad: i.cantidad,
      unidad: i.unidad,
      unidadBase: i.unidadBase,
      // La base guarda la merma en puntos base y el dominio la espera en por ciento.
      mermaPorcentaje: (i.mermaBp / 100).toString(),
    })),
  };
}

/** Solo se venden los platillos cuyo consumo el servidor sabría descontar. */
export function platillosConConsumoValido(ctx: ContextoDeHistorial): readonly ProductoVendible[] {
  return ctx.productos.filter((producto) => {
    try {
      const linea = lineaParaConsumo(ctx, 'prueba', 'aqui', producto, '1', 'prueba');
      if (linea !== null) calcularConsumo([linea]);
      return true;
    } catch {
      // Un platillo cuya receta no se puede convertir (unidades incompatibles) tampoco se
      // podría cobrar de verdad: se queda fuera del menú del historial en vez de venderse sin
      // descontar nada. No se silencia un fallo: es la regla del cobro aplicada antes.
      return false;
    }
  });
}

function satisfaccionOcasional(
  azar: Azar,
  cobradaEn: Date,
  limite: Date,
): SatisfaccionPlaneada | null {
  if (!azar.probabilidad(0.18)) return null;
  const puntaje = azar.ponderado([
    { valor: 5, peso: 45 },
    { valor: 4, peso: 35 },
    { valor: 3, peso: 12 },
    { valor: 2, peso: 5 },
    { valor: 1, peso: 3 },
  ]);
  const comentarios = COMENTARIOS[puntaje] ?? [];
  const comenta = comentarios.length > 0 && azar.probabilidad(0.4);
  const deseada = sumarMinutos(cobradaEn, azar.entero(3, 25));
  return {
    puntaje,
    emoji: EMOJIS[puntaje] ?? '😐',
    comentario: comenta ? azar.elegir(comentarios) : null,
    en: deseada < limite ? deseada : cobradaEn,
  };
}

/**
 * Los dos cajeros del día: el de la comida abre la caja y hace el corte de turno; el de la
 * cena recibe el turno y la cierra. Con una sola persona que cobre, es la misma.
 */
export function cajerosDelDia(
  ctx: ContextoDeHistorial,
  dia: string,
): { readonly comida: EmpleadoRef; readonly cena: EmpleadoRef } {
  const hoy = diaDeLaSemana(dia);
  const comida = ctx.cajeros[hoy % ctx.cajeros.length];
  const cena = ctx.cajeros[(hoy + 1) % ctx.cajeros.length] ?? comida;
  if (comida === undefined || cena === undefined) {
    throw new RangeError('El contexto no trae quien cobre.');
  }
  return { comida, cena };
}

/** Quien cobra: el cajero de la comida hasta el corte de turno, el de la cena después. */
function cajeroDe(ctx: ContextoDeHistorial, dia: string, cobradaEn: Date): EmpleadoRef {
  const { comida, cena } = cajerosDelDia(ctx, dia);
  return cobradaEn < instanteLocal(dia, MINUTO_DEL_CORTE_DE_TURNO, ctx.zona) ? comida : cena;
}

function lineasDeLaCuenta(
  azar: Azar,
  cuentaId: string,
  pedido: readonly ProductoVendible[],
): LineaPlaneada[] {
  return juntarRenglones(azar, pedido).map((r, orden) => {
    const subtotal = r.producto.precioCentavos * BigInt(r.cantidad);
    return {
      id: idDeterminista(cuentaId, 'linea', orden),
      producto: r.producto,
      cantidad: r.cantidad,
      orden,
      subtotalCentavos: subtotal,
      descuentoCentavos: 0n,
      totalCentavos: subtotal,
      costoCentavos: porCantidad(r.producto.costoCentavos, String(r.cantidad)),
    };
  });
}

/** Reparte el descuento entre las líneas, en proporción a lo que cada una vale. */
function conDescuento(
  lineas: readonly LineaPlaneada[],
  descuento: DescuentoPlaneado | null,
): LineaPlaneada[] {
  if (descuento === null) return [...lineas];
  const partes = repartirPorPesos(
    centavos(descuento.totalCentavos),
    lineas.map((l) => Number(l.subtotalCentavos)),
  );
  return lineas.map((l, i) => {
    const parte = partes[i] ?? 0n;
    return { ...l, descuentoCentavos: parte, totalCentavos: l.subtotalCentavos - parte };
  });
}

function armarCuenta(p: ParametrosDeCuentas, indice: number, llegada: Llegada): CuentaPlaneada {
  const { ctx, dia, azar } = p;
  const id = idDeterminista(ctx.organizacionId, ctx.semilla, dia, 'orden', indice);
  const canal = llegada.esMesa ? 'aqui' : 'llevar';
  const personas = llegada.esMesa ? azar.ponderado(COMENSALES) : 1;
  const abiertaEn = instanteLocal(dia, llegada.inicio, ctx.zona);
  const atiende = azar.elegir(ctx.meseros);

  const pedido = llegada.esMesa
    ? pedidoDeMesa(azar, p.productos, personas)
    : pedidoParaLlevar(azar, p.productos);
  const lineasBase = lineasDeLaCuenta(azar, id, pedido);

  // En una mesa el pedido se marcha a cocina a los pocos minutos de sentarse; en el mostrador
  // se cobra primero y cobro y marcha son el mismo instante.
  const marchadaEn = sumarMinutos(
    abiertaEn,
    llegada.esMesa ? azar.entero(4, 8) : azar.entero(2, 4),
  );
  const comandas = cronogramaDeCocina(azar, ctx, lineasBase, marchadaEn, id);
  const ultimaEntrega = comandas.reduce(
    (t, c) => Math.max(t, c.entregadaEn.getTime()),
    marchadaEn.getTime(),
  );
  const cobradaEn = llegada.esMesa
    ? sumarMinutos(
        new Date(ultimaEntrega),
        16 + 4 * personas + azar.entero(0, 15) + azar.entero(3, 6),
      )
    : marchadaEn;
  const cajero = cajeroDe(ctx, dia, cobradaEn);

  const base = lineasBase.reduce((suma, l) => suma + l.subtotalCentavos, 0n);
  const descuento = descuentoOcasional(azar, ctx, cajero, base);
  const lineas = conDescuento(lineasBase, descuento);
  const totales = calcularTotales(
    lineas.map((l) => ({
      subtotalCentavos: centavos(l.subtotalCentavos),
      descuentoCentavos: centavos(l.descuentoCentavos),
      costoCentavos: centavos(l.costoCentavos),
    })),
    ctx.impuesto,
  );

  return {
    id,
    canal,
    mesa: null,
    personas,
    nombrePedido: llegada.esMesa ? null : azar.elegir(NOMBRES_PARA_LLEVAR),
    mesero: llegada.esMesa ? atiende : cajero,
    cajero,
    abiertaEn,
    precuentaEn: llegada.esMesa ? sumarMinutos(cobradaEn, -azar.entero(3, 6)) : null,
    cobradaEn,
    terminaEn: new Date(Math.max(ultimaEntrega, cobradaEn.getTime())),
    lineas,
    comandas,
    descuento,
    totales,
    cobro: planearCobro(azar, totales.totalCentavos, llegada.esMesa),
    satisfaccion: llegada.esMesa
      ? satisfaccionOcasional(
          azar,
          cobradaEn,
          instanteLocal(dia, LIMITE_DE_LA_VALORACION, ctx.zona),
        )
      : null,
    consumo: calcularConsumo(
      lineas.flatMap((l) => {
        const linea = lineaParaConsumo(ctx, id, canal, l.producto, String(l.cantidad), l.id);
        return linea === null ? [] : [linea];
      }),
    ),
  };
}

/** La mesa libre más justa para el grupo durante todo el rato que va a estar. */
function mesaLibre(
  azar: Azar,
  mesas: readonly MesaRef[],
  ocupaciones: readonly Ocupacion[],
  personas: number,
  desde: number,
  hasta: number,
): MesaRef | null {
  const libres = mesas.filter(
    (m) => !ocupaciones.some((o) => o.mesaId === m.id && o.desde < hasta && desde < o.hasta),
  );
  const conLugar = libres.filter((m) => m.capacidad >= personas);
  if (conLugar.length === 0) return libres.length > 0 ? azar.elegir(libres) : null;
  const justa = Math.min(...conLugar.map((m) => m.capacidad));
  return azar.elegir(conLugar.filter((m) => m.capacidad === justa));
}

function llegadasDelDia(p: ParametrosDeCuentas): Llegada[] {
  const { ctx, azar, dia } = p;
  return Array.from({ length: cuentasDelDia(azar, dia) }, () => {
    const esMesa = ctx.mesas.length > 0 && azar.probabilidad(0.78);
    return {
      esMesa,
      inicio: minutoDeLlegada(azar, esMesa ? ULTIMA_CUENTA_EN_MESA : ULTIMA_CUENTA_PARA_LLEVAR),
    };
  }).sort((a, b) => a.inicio - b.inicio);
}

/** Todas las cuentas del día, de la que se cobra primero a la que se cobra última. */
export function planearCuentas(p: ParametrosDeCuentas): readonly CuentaPlaneada[] {
  const ocupaciones: Ocupacion[] = [];
  const cuentas: CuentaPlaneada[] = [];

  for (const [indice, llegada] of llegadasDelDia(p).entries()) {
    let cuenta = armarCuenta(p, indice, llegada);
    if (llegada.esMesa) {
      const hasta = cuenta.terminaEn.getTime() + MARGEN_ENTRE_COMENSALES;
      const mesa = mesaLibre(
        p.azar,
        p.ctx.mesas,
        ocupaciones,
        cuenta.personas,
        cuenta.abiertaEn.getTime(),
        hasta,
      );
      if (mesa === null) {
        // Sin mesa libre a esa hora, el cliente pide para llevar: la cuenta se arma de nuevo.
        cuenta = armarCuenta(p, indice, { esMesa: false, inicio: llegada.inicio });
      } else {
        cuenta = { ...cuenta, mesa };
        ocupaciones.push({ mesaId: mesa.id, desde: cuenta.abiertaEn.getTime(), hasta });
      }
    }
    cuentas.push(cuenta);
  }
  return cuentas.sort(
    (a, b) => a.cobradaEn.getTime() - b.cobradaEn.getTime() || a.id.localeCompare(b.id),
  );
}
