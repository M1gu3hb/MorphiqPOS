/**
 * Un SALÓN DE VERDAD en la base de integración, para las pruebas que dividen, juntan, mudan y
 * cobran cuentas de mesa contra Postgres (cierre del restaurante, 21-10).
 *
 * ── Qué es y qué NO es ────────────────────────────────────────────────────────
 * Sólo siembra el andamiaje que en producción da de alta otra herramienta —el negocio, la
 * sucursal con sus cajas, las mesas, la cocina, el menú con sus recetas y el almacén— y deja
 * funciones CORTAS que llaman al comando de producción (`comando(...)`) para lo que se
 * prueba: abrir la mesa, mandar el pedido, pedir la cuenta, dividir, cobrar. Cada llamada
 * pasa por el rol, el paquete, la idempotencia y la transacción reales; lo que cada prueba
 * afirma sale de LEER la base después, no de lo que el comando contestó.
 *
 * ── El menú, con centavos que no se dejan dividir por dos ──────────────────────
 * Los precios terminan en 90, 55 y 99 a propósito: una cuenta de importes redondos se divide
 * sin sobrar un centavo y no enseña nada. Con éstos el reparto por unidades tiene residuos, y
 * el residuo es donde una división pierde o inventa dinero.
 *
 * Ids nuevos en cada llamada y ninguna limpieza, igual que `negocio-real.ts`.
 */
import { randomUUID } from 'node:crypto';

import type { Ambito, Resultado } from '@morphiqpos/contracts';
import { obtenerDb } from '@morphiqpos/data';

import { comando } from '../../produccion.ts';
import {
  abrirCajaReal,
  ambitoDe,
  clave,
  exigirOk,
  sembrarNegocio,
  sembrarSucursal,
  type NegocioReal,
  type SucursalReal,
} from '../../pruebas/negocio-real.ts';
import { cobrarOrden, type ResultadoCobro } from '../../venta/cobrar.ts';
import { solicitarCuenta } from '../cuenta.ts';
import { dividirCuentaComando, type ResultadoDivision } from '../division.ts';
import { abrirMesa } from '../mesas.ts';
import { enviarPedido } from '../pedido.ts';

export const PRECIO_ARRACHERA = 32_990n;
export const PRECIO_CERVEZA = 5_555n;
export const PRECIO_GUACAMOLE = 8_999n;

/** Lo que cada platillo gasta del almacén, en la unidad base de cada insumo. */
export const RECETAS = {
  arrachera: [
    { insumo: 'arrachera', cantidad: 280 },
    { insumo: 'frijol', cantidad: 150 },
    { insumo: 'tortilla', cantidad: 4 },
  ],
  guacamole: [
    { insumo: 'aguacate', cantidad: 2 },
    { insumo: 'jitomate', cantidad: 100 },
  ],
  // La cerveza no tiene receta: es un artículo del almacén (`sku`) y baja una pieza.
  cerveza: [{ insumo: 'cerveza', cantidad: 1 }],
} as const;

/** Lo que hay en el almacén al sembrar, por insumo. */
export const EXISTENCIA_INICIAL = {
  arrachera: 10_000,
  frijol: 5_000,
  tortilla: 500,
  aguacate: 200,
  jitomate: 5_000,
  cerveza: 100,
} as const;

export type NombreDeInsumo = keyof typeof EXISTENCIA_INICIAL;
export type NombreDePlatillo = keyof typeof RECETAS;

export interface Salon {
  readonly negocio: NegocioReal;
  readonly sucursal: SucursalReal;
  /** Los ids de las mesas: la de índice 0 es la mesa número 1. */
  readonly mesas: readonly string[];
  readonly platillos: Readonly<Record<NombreDePlatillo, string>>;
  readonly insumos: Readonly<Record<NombreDeInsumo, string>>;
}

export interface OpcionesDeSalon {
  readonly nombre: string;
  readonly mesas: number;
  /** Cuántas terminales de caja tiene la sucursal; todas pueden estar abiertas a la vez. */
  readonly terminales?: number;
}

const UNIDAD_DE: Readonly<Record<NombreDeInsumo, 'g' | 'pieza'>> = {
  arrachera: 'g',
  frijol: 'g',
  tortilla: 'pieza',
  aguacate: 'pieza',
  jitomate: 'g',
  cerveza: 'pieza',
};

/**
 * Siembra el negocio de restaurante entero: sucursal con cupo para todas sus cajas, mesas
 * numeradas desde 1, la cocina general, los tres platillos con su receta y el almacén lleno.
 */
export async function sembrarSalon(opciones: OpcionesDeSalon): Promise<Salon> {
  const terminales = opciones.terminales ?? 1;
  const negocio = await sembrarNegocio({
    nombre: opciones.nombre,
    rol: 'cajero',
    giro: 'restaurante',
    paquete: 'restaurante',
  });
  const sucursal = await sembrarSucursal(negocio, {
    terminales: Array.from({ length: terminales }, (_, i) => `Caja ${String(i + 1)}`),
    cajasSimultaneas: terminales,
  });
  const db = obtenerDb();
  const org = negocio.organizacionId;

  await db
    .insertInto('estaciones_preparacion')
    .values({ organizacion_id: org, nombre: 'Cocina general', es_general: true })
    .execute();

  // El insumo de cada cosa que gasta el almacén, y su existencia.
  const insumos = {} as Record<NombreDeInsumo, string>;
  for (const nombre of Object.keys(EXISTENCIA_INICIAL) as NombreDeInsumo[]) {
    const id = randomUUID();
    insumos[nombre] = id;
    await db
      .insertInto('insumos')
      .values({
        id,
        organizacion_id: org,
        nombre: `Insumo ${nombre} ${id.slice(0, 6)}`,
        unidad_base: UNIDAD_DE[nombre],
      })
      .execute();
    await db
      .insertInto('existencias')
      .values({
        organizacion_id: org,
        almacen_id: sucursal.almacenId,
        insumo_id: id,
        cantidad: String(EXISTENCIA_INICIAL[nombre]),
      })
      .execute();
  }

  const producto = async (
    nombre: string,
    precio: bigint,
    estrategia: 'receta' | 'sku',
  ): Promise<string> =>
    (
      await db
        .insertInto('productos')
        .values({
          organizacion_id: org,
          nombre,
          precio_venta_centavos: precio,
          costo_unitario_centavos: precio / 2n,
          estrategia_consumo: estrategia,
          area_preparacion: 'cocina',
        })
        .returning('id')
        .executeTakeFirstOrThrow()
    ).id;

  const platillos = {
    arrachera: await producto('Arrachera al carbón', PRECIO_ARRACHERA, 'receta'),
    guacamole: await producto('Guacamole con totopos', PRECIO_GUACAMOLE, 'receta'),
    cerveza: await producto('Cerveza clara', PRECIO_CERVEZA, 'sku'),
  };

  for (const platillo of ['arrachera', 'guacamole'] as const) {
    await db
      .insertInto('recetas')
      .values(
        RECETAS[platillo].map((linea) => ({
          organizacion_id: org,
          producto_id: platillos[platillo],
          insumo_id: insumos[linea.insumo],
          cantidad: String(linea.cantidad),
          unidad: UNIDAD_DE[linea.insumo],
        })),
      )
      .execute();
  }
  // La cerveza es EL insumo de su propio producto: así la encuentra `productoParaVender`.
  await db
    .updateTable('insumos')
    .set({ producto_id: platillos.cerveza })
    .where('id', '=', insumos.cerveza)
    .execute();

  const mesas = (
    await db
      .insertInto('mesas')
      .values(
        Array.from({ length: opciones.mesas }, (_, i) => ({
          organizacion_id: org,
          sucursal_id: sucursal.sucursalId,
          numero: i + 1,
        })),
      )
      .returning(['id', 'numero'])
      .execute()
  )
    .sort((a, b) => a.numero - b.numero)
    .map((m) => m.id);

  return { negocio, sucursal, mesas, platillos, insumos };
}

/** El ámbito de la caja de índice `terminal`: el cajero que abre, divide y cobra. */
export function ambitoDeCaja(salon: Salon, terminal = 0): Ambito {
  return ambitoDe(
    salon.negocio,
    salon.sucursal.sucursalId,
    salon.sucursal.terminales[terminal] ?? null,
  );
}

/** Abre la caja de cada terminal del salón, con el mismo fondo. Devuelve sus sesiones. */
export async function abrirLasCajas(salon: Salon, fondoCentavos = 50_000): Promise<string[]> {
  const sesiones: string[] = [];
  for (let i = 0; i < salon.sucursal.terminales.length; i += 1) {
    sesiones.push(await abrirCajaReal(ambitoDeCaja(salon, i), fondoCentavos));
  }
  return sesiones;
}

export function mesaDe(salon: Salon, indice: number): string {
  const id = salon.mesas[indice];
  if (id === undefined) throw new Error(`El salón no tiene la mesa de índice ${String(indice)}.`);
  return id;
}

export interface CuentaAbierta {
  readonly mesaId: string;
  readonly ordenId: string;
}

export interface PlatilloPedido {
  readonly platillo: NombreDePlatillo;
  readonly cantidad: string;
}

/** Sienta gente en la mesa y manda su primer pedido a cocina, por los comandos de producción. */
export async function sentarYPedir(
  salon: Salon,
  indiceDeMesa: number,
  pedido: readonly PlatilloPedido[],
): Promise<CuentaAbierta> {
  const mesaId = mesaDe(salon, indiceDeMesa);
  const { ordenId } = exigirOk(
    await comando(abrirMesa, {
      entrada: { mesaId, personas: 4 },
      ambito: ambitoDeCaja(salon),
      idempotencyKey: clave(),
    }),
    'restaurante.abrir_mesa',
  );
  await pedirMas(salon, ordenId, pedido);
  return { mesaId, ordenId };
}

/** Otro pedido a una cuenta que ya está abierta. */
export async function pedirMas(
  salon: Salon,
  ordenId: string,
  pedido: readonly PlatilloPedido[],
): Promise<void> {
  exigirOk(
    await comando(enviarPedido, {
      entrada: {
        ordenId,
        lineas: pedido.map((p) => ({
          productoId: salon.platillos[p.platillo],
          cantidad: p.cantidad,
        })),
      },
      ambito: ambitoDeCaja(salon),
      idempotencyKey: clave(),
    }),
    'restaurante.enviar_pedido',
  );
}

/** La mesa pide la cuenta; `propinaPuntosBase` es lo que el mesero le preguntó. */
export async function pedirLaCuenta(
  salon: Salon,
  ordenId: string,
  propinaPuntosBase?: number,
): Promise<void> {
  exigirOk(
    await comando(solicitarCuenta, {
      entrada:
        propinaPuntosBase === undefined
          ? { ordenId, propinaTipo: 'sin_propina' }
          : { ordenId, propinaTipo: 'porcentaje', propinaPuntosBase },
      ambito: ambitoDeCaja(salon),
      idempotencyKey: clave(),
    }),
    'restaurante.solicitar_cuenta',
  );
}

/** Las líneas vivas de una cuenta, por nombre de producto: `{ 'Arrachera al carbón': [id, …] }`. */
export async function lineasDe(ordenId: string): Promise<ReadonlyMap<string, readonly string[]>> {
  const filas = await obtenerDb()
    .selectFrom('orden_lineas')
    .select(['id', 'producto_nombre'])
    .where('orden_id', '=', ordenId)
    .where('anulada_en', 'is', null)
    .orderBy('orden_visual')
    .execute();
  const porNombre = new Map<string, string[]>();
  for (const fila of filas) {
    porNombre.set(fila.producto_nombre, [...(porNombre.get(fila.producto_nombre) ?? []), fila.id]);
  }
  return porNombre;
}

/** Una toma de la división: cuántas unidades de la línea de ESTE platillo se lleva la parte. */
export interface TomaPorPlatillo {
  readonly platillo: NombreDePlatillo;
  readonly cantidad: number;
}

const NOMBRE_DEL_PLATILLO: Readonly<Record<NombreDePlatillo, string>> = {
  arrachera: 'Arrachera al carbón',
  guacamole: 'Guacamole con totopos',
  cerveza: 'Cerveza clara',
};

/** Divide la cuenta en las partes dadas. Cada platillo está en UNA línea de la cuenta. */
export async function dividirEn(
  salon: Salon,
  ordenId: string,
  partes: readonly (readonly TomaPorPlatillo[])[],
): Promise<ResultadoDivision> {
  const lineas = await lineasDe(ordenId);
  const lineaDe = (platillo: NombreDePlatillo): string => {
    const id = lineas.get(NOMBRE_DEL_PLATILLO[platillo])?.[0];
    if (id === undefined) throw new Error(`La cuenta no tiene ${NOMBRE_DEL_PLATILLO[platillo]}.`);
    return id;
  };
  return exigirOk(
    await comando(dividirCuentaComando, {
      entrada: {
        ordenId,
        particiones: partes.map((tomas) => ({
          tomas: tomas.map((t) => ({ lineaId: lineaDe(t.platillo), cantidad: t.cantidad })),
        })),
      },
      ambito: ambitoDeCaja(salon),
      idempotencyKey: clave(),
    }),
    'restaurante.dividir_cuenta',
  );
}

/** Un renglón de pago, tal como la pantalla de cobro lo manda. */
export interface PagoDePrueba {
  readonly metodo: 'efectivo' | 'tarjeta' | 'transferencia';
  readonly montoCentavos: number;
  readonly recibidoCentavos?: number | undefined;
  readonly propinaCentavos?: number | undefined;
}

/** El cobro de una cuenta por `venta.cobrar`, con una clave de idempotencia nueva. */
export function cobrar(
  ambito: Ambito,
  ordenId: string,
  totalCentavos: number,
  pagos: readonly PagoDePrueba[],
  idempotencyKey = clave(),
): Promise<Resultado<ResultadoCobro>> {
  return comando(cobrarOrden, {
    entrada: { ordenId, pagos: [...pagos], totalEsperadoCentavos: totalCentavos },
    ambito,
    idempotencyKey,
  });
}

/** El cobro en efectivo exacto, para las pruebas a las que el método no les importa. */
export function cobrarExacto(ambito: Ambito, ordenId: string, totalCentavos: number) {
  return cobrar(ambito, ordenId, totalCentavos, [
    { metodo: 'efectivo', montoCentavos: totalCentavos },
  ]);
}

// ── Lo que se LEE de la base para afirmar ─────────────────────────────────────

export async function mesaPersistida(mesaId: string) {
  return obtenerDb()
    .selectFrom('mesas')
    .select(['numero', 'estado', 'orden_activa_id', 'unida_a_mesa_id'])
    .where('id', '=', mesaId)
    .executeTakeFirstOrThrow();
}

export async function ordenPersistida(ordenId: string) {
  return obtenerDb()
    .selectFrom('ordenes')
    .select(['estado', 'total_centavos', 'folio', 'serie', 'mesa_id', 'orden_padre_id'])
    .where('id', '=', ordenId)
    .executeTakeFirstOrThrow();
}

export async function pagosDe(ordenIds: readonly string[]) {
  if (ordenIds.length === 0) return [];
  return obtenerDb()
    .selectFrom('pagos')
    .select([
      'orden_id',
      'metodo',
      'monto_centavos',
      'propina_centavos',
      'recibido_centavos',
      'cambio_centavos',
      'sesion_caja_id',
    ])
    .where('orden_id', 'in', [...ordenIds])
    .orderBy('created_at')
    .execute();
}

export async function sumaDeLosPagos(ordenIds: readonly string[]): Promise<bigint> {
  return (await pagosDe(ordenIds)).reduce((suma, p) => suma + p.monto_centavos, 0n);
}

/** Cuántas comandas y cuántos platos tiene la cocina para estas cuentas. */
export async function fotoDeLaCocina(
  ordenIds: readonly string[],
): Promise<{ readonly comandas: number; readonly items: number }> {
  const db = obtenerDb();
  const comandas = await db
    .selectFrom('comandas')
    .select('id')
    .where('orden_id', 'in', [...ordenIds])
    .execute();
  if (comandas.length === 0) return { comandas: 0, items: 0 };
  const items = await db
    .selectFrom('comanda_items')
    .select('id')
    .where(
      'comanda_id',
      'in',
      comandas.map((c) => c.id),
    )
    .execute();
  return { comandas: comandas.length, items: items.length };
}

/** Lo que hay hoy en el almacén de cada insumo, como texto de `numeric(14,4)`. */
export async function existenciasDelSalon(salon: Salon): Promise<Record<NombreDeInsumo, string>> {
  const filas = await obtenerDb()
    .selectFrom('existencias')
    .select(['insumo_id', 'cantidad'])
    .where('organizacion_id', '=', salon.negocio.organizacionId)
    .execute();
  const salida = {} as Record<NombreDeInsumo, string>;
  for (const nombre of Object.keys(salon.insumos) as NombreDeInsumo[]) {
    salida[nombre] =
      filas.find((f) => f.insumo_id === salon.insumos[nombre])?.cantidad ?? 'sin fila';
  }
  return salida;
}

/** `1234` → `'1234.0000'`: el formato en que Postgres devuelve un `numeric(14,4)`. */
export function comoCantidad(valor: number): string {
  return valor.toFixed(4);
}

/** Lo que el pedido debe haber gastado del almacén, por insumo, según las recetas. */
export function consumoEsperado(pedido: readonly PlatilloPedido[]): Record<NombreDeInsumo, number> {
  const gasto: Record<NombreDeInsumo, number> = {
    arrachera: 0,
    frijol: 0,
    tortilla: 0,
    aguacate: 0,
    jitomate: 0,
    cerveza: 0,
  };
  for (const { platillo, cantidad } of pedido) {
    for (const ingrediente of RECETAS[platillo]) {
      gasto[ingrediente.insumo] += ingrediente.cantidad * Number(cantidad);
    }
  }
  return gasto;
}

/** El ledger de transiciones de una mesa, en el orden en que ocurrieron. */
export async function eventosDeLaMesa(mesaId: string) {
  return obtenerDb()
    .selectFrom('eventos_mesa')
    .select(['estado_anterior', 'estado_nuevo', 'orden_id', 'ocurrido_en'])
    .where('mesa_id', '=', mesaId)
    .orderBy('ocurrido_en')
    .execute();
}

/** `bigint` y `Date` no caben en `JSON.stringify`: así se vuelve texto la evidencia de una falla. */
export function comoTexto(valor: unknown): string {
  return JSON.stringify(
    valor,
    (_clave, v: unknown) => (typeof v === 'bigint' ? v.toString() : v),
    2,
  );
}

/**
 * La FOTO del estado de una cuenta dividida, para pegarla en el mensaje de una afirmación que
 * falla: la mesa, la madre y cada parte con su cobro, y el ledger de la mesa.
 */
export async function evidenciaDeLaDivision(
  mesaId: string,
  madreId: string,
  partes: readonly string[],
): Promise<string> {
  const db = obtenerDb();
  const ordenes = await db
    .selectFrom('ordenes')
    .select(['id', 'estado', 'division_indice', 'folio', 'total_centavos', 'orden_padre_id'])
    .where('id', 'in', [madreId, ...partes])
    .orderBy('division_indice')
    .execute();
  return comoTexto({
    mesas: await mesaPersistida(mesaId),
    ordenes,
    pagos: await pagosDe([madreId, ...partes]),
    eventos_mesa: await eventosDeLaMesa(mesaId),
  });
}

// ── La cuenta dividida en tres, con dos partes por cobrar (C02) ────────────────

export const CERVEZA_CENTAVOS = 5_555;
export const ARRACHERA_CENTAVOS = 32_990;
export const GUACAMOLE_CENTAVOS = 8_999;

/** Una mesa con su cuenta dividida en tres partes —una cerveza, una arrachera, un guacamole—. */
export interface MesaDividida {
  readonly mesaId: string;
  readonly madreId: string;
  readonly cerveza: string;
  readonly arrachera: string;
  readonly guacamole: string;
}

/**
 * Sienta a la mesa, le pide la cuenta, la divide en tres y cobra la PRIMERA parte (la cerveza,
 * en efectivo, en la caja 1). Quedan por cobrar las dos últimas, que consumen insumos distintos:
 * así nada, salvo lo que el cobro comparta por su cuenta, las junta antes de una barrera.
 */
export async function mesaDivididaEnTresConLaPrimeraCobrada(
  salon: Salon,
  indiceDeMesa: number,
): Promise<MesaDividida> {
  const { mesaId, ordenId } = await sentarYPedir(salon, indiceDeMesa, [
    { platillo: 'cerveza', cantidad: '1' },
    { platillo: 'arrachera', cantidad: '1' },
    { platillo: 'guacamole', cantidad: '1' },
  ]);
  await pedirLaCuenta(salon, ordenId);
  const division = await dividirEn(salon, ordenId, [
    [{ platillo: 'cerveza', cantidad: 1 }],
    [{ platillo: 'arrachera', cantidad: 1 }],
    [{ platillo: 'guacamole', cantidad: 1 }],
  ]);
  const [primera, segunda, tercera] = division.hijas;
  if (primera === undefined || segunda === undefined || tercera === undefined) {
    throw new Error('La división debía dar tres partes.');
  }
  exigirOk(
    await cobrarExacto(ambitoDeCaja(salon, 0), primera.ordenId, CERVEZA_CENTAVOS),
    'venta.cobrar (la primera parte)',
  );
  return {
    mesaId,
    madreId: ordenId,
    cerveza: primera.ordenId,
    arrachera: segunda.ordenId,
    guacamole: tercera.ordenId,
  };
}

/** Los dos cobros que se cruzan —arrachera y guacamole—, cada uno en su caja; `alReves` las cambia. */
export function lasDosUltimas(salon: Salon, mesa: MesaDividida, alReves: boolean) {
  return {
    arrachera: () =>
      cobrarExacto(ambitoDeCaja(salon, alReves ? 1 : 0), mesa.arrachera, ARRACHERA_CENTAVOS),
    guacamole: () =>
      cobrarExacto(ambitoDeCaja(salon, alReves ? 0 : 1), mesa.guacamole, GUACAMOLE_CENTAVOS),
  };
}

/**
 * Lo que tiene que ser cierto cuando las tres partes están cobradas, sea cual sea el orden en que
 * se cobraron. `null` si lo es; si no, qué falló y la FOTO del estado de la base para el informe.
 */
export async function diagnosticoDeLaMesaCobrada(mesa: MesaDividida): Promise<string | null> {
  const partes = [mesa.cerveza, mesa.arrachera, mesa.guacamole];
  const db = obtenerDb();
  const mesaFinal = await mesaPersistida(mesa.mesaId);
  const estadosDeLasPartes = await db
    .selectFrom('ordenes')
    .select('estado')
    .where('id', 'in', partes)
    .execute();
  const pagado = await sumaDeLosPagos(partes);
  const recogidas = (await eventosDeLaMesa(mesa.mesaId)).filter(
    (e) => e.estado_anterior === 'cuenta_solicitada' && e.estado_nuevo === 'limpieza',
  );
  const madre = await db
    .selectFrom('ordenes')
    .select(['estado', 'total_centavos'])
    .where('id', '=', mesa.madreId)
    .executeTakeFirstOrThrow();

  const fallas: string[] = [];
  if (!estadosDeLasPartes.every((p) => p.estado === 'pagada')) {
    fallas.push('alguna parte no quedó pagada');
  }
  if (pagado !== madre.total_centavos) {
    fallas.push(`los pagos suman ${String(pagado)} y la cuenta ${String(madre.total_centavos)}`);
  }
  if (madre.estado !== 'dividida') fallas.push(`la madre quedó ${madre.estado}`);
  if (mesaFinal.estado !== 'limpieza') {
    fallas.push(`LA MESA QUEDÓ ${mesaFinal.estado.toUpperCase()}, no en limpieza`);
  }
  if (recogidas.length !== 1) {
    fallas.push(`la mesa se recogió ${String(recogidas.length)} veces (debía ser una)`);
  }
  return fallas.length === 0
    ? null
    : `${fallas.join('; ')}\n${await evidenciaDeLaDivision(mesa.mesaId, mesa.madreId, partes)}`;
}

/**
 * El ledger de una mesa tiene que ser UNA CADENA: arranca en `libre`, cada transición sale del
 * estado al que llegó la anterior, y la última llega al estado en que la mesa está hoy. Un hueco
 * fusiona dos ciclos de ocupación y da una rotación del doble de larga (F-305).
 *
 * `null` si lo es; si no, qué eslabón se rompe.
 */
export function huecosEnElLedger(
  eventos: readonly { readonly estado_anterior: string | null; readonly estado_nuevo: string }[],
  estadoActual: string,
): string | null {
  const [primero] = eventos;
  if (primero === undefined) {
    return estadoActual === 'libre' ? null : `sin eventos y la mesa está ${estadoActual}`;
  }
  if (primero.estado_anterior !== null && primero.estado_anterior !== 'libre') {
    return `el primer evento sale de ${primero.estado_anterior}, no de libre`;
  }
  for (let i = 1; i < eventos.length; i += 1) {
    const previo = eventos[i - 1];
    const actual = eventos[i];
    if (
      previo !== undefined &&
      actual !== undefined &&
      actual.estado_anterior !== previo.estado_nuevo
    ) {
      return `hueco entre el evento ${String(i)} (llega a ${previo.estado_nuevo}) y el ${String(i + 1)} (sale de ${String(actual.estado_anterior)})`;
    }
  }
  const ultimo = eventos[eventos.length - 1];
  if (ultimo !== undefined && ultimo.estado_nuevo !== estadoActual) {
    return `el último evento llega a ${ultimo.estado_nuevo} y la mesa está ${estadoActual}`;
  }
  return null;
}
