import { obtenerDb, repoCaja } from '@morphiqpos/data';
import { beforeAll, describe, expect, it } from 'vitest';

import { comando } from '../produccion.ts';
import { ambitoDe, clave, exigirOk } from '../pruebas/negocio-real.ts';
import { cotizar } from '../venta/cotizar.ts';
import { descontarCuenta } from './descuento-de-cuenta.ts';
import {
  PRECIO_ARRACHERA,
  PRECIO_CERVEZA,
  PRECIO_GUACAMOLE,
  abrirLasCajas,
  ambitoDeCaja,
  cobrar,
  comoCantidad,
  consumoEsperado,
  dividirEn,
  eventosDeLaMesa,
  existenciasDelSalon,
  fotoDeLaCocina,
  huecosEnElLedger,
  mesaPersistida,
  ordenPersistida,
  pagosDe,
  pedirLaCuenta,
  sembrarSalon,
  sentarYPedir,
  sumaDeLosPagos,
  type NombreDeInsumo,
  type Salon,
} from './pruebas/salon-real.ts';

/**
 * C01 · DIVIDIR LA CUENTA DE UNA MESA EN DOS PARTES Y COBRAR CADA UNA, contra Postgres (cierre
 * del restaurante, 21-10).
 *
 * La división está probada casi sólo con la base falsa, que no tiene triggers diferidos, índices
 * únicos ni transacciones. Aquí la mesa 1 pide 2 arracheras, 2 cervezas y 1 guacamole, pide la
 * cuenta con 10 % de propina y se divide en dos partes —una arrachera y las dos cervezas; la otra
 * arrachera y el guacamole—. Todo entra por `comando(...)`: abrir, pedir, dividir y cobrar cada
 * parte, una en efectivo con cambio en la caja 1 y otra con tarjeta en la caja 2. Lo que se
 * afirma se LEE de la base después: el dinero (`pagos`, `movimientos_caja`, el arqueo), el estado
 * (`ordenes`, `mesas`, `eventos_mesa`), la cocina (`comandas`, `comanda_items`) y el almacén
 * (`existencias`, `movimientos_stock`).
 *
 * Los precios terminan en centavos que no se dejan partir por la mitad (329.90, 55.55, 89.99)
 * para que un reparto torpe se note.
 *
 * Al final, tres casos que el recorrido feliz no toca y que SÍ rompen el cobro de una mesa: la
 * cuenta que ya llevaba un descuento cuando se dividió (C01b), el descuento que se da a una parte
 * después (C01c) y el negocio que guarda el IVA fuera del precio (C01d). Los tres estuvieron en
 * rojo hasta el cierre del 21-10: cada parte vale ahora lo que `cotizar` le cobrará y la madre lo
 * que suman sus partes (`division-escrituras.ts`, `ajustarLaMadreASusPartes`).
 */

const PEDIDO = [
  { platillo: 'arrachera', cantidad: '2' },
  { platillo: 'cerveza', cantidad: '2' },
  { platillo: 'guacamole', cantidad: '1' },
] as const;

const TOTAL_DE_LA_CUENTA = 2n * PRECIO_ARRACHERA + 2n * PRECIO_CERVEZA + PRECIO_GUACAMOLE;
/** Parte 1: una arrachera y las dos cervezas. Parte 2: la otra arrachera y el guacamole. */
const PARTE_1 = PRECIO_ARRACHERA + 2n * PRECIO_CERVEZA;
const PARTE_2 = PRECIO_ARRACHERA + PRECIO_GUACAMOLE;
const FONDO = 50_000;

/** La propina de 10 % de cada parte, redondeada al centavo: 4 410 y 4 199. */
const PROPINA_1 = 4_410;
const PROPINA_2 = 4_199;
const RECIBIDO_1 = 50_000;
const CAMBIO_1 = RECIBIDO_1 - Number(PARTE_1) - PROPINA_1;

type Existencias = Record<NombreDeInsumo, string>;

interface Escenario {
  readonly salon: Salon;
  readonly sesiones: readonly string[];
  readonly mesaId: string;
  readonly madreId: string;
  readonly partes: readonly [string, string];
  readonly claveDelCobro1: string;
  readonly cocinaAntesDeDividir: { readonly comandas: number; readonly items: number };
  readonly cocinaTrasDividir: { readonly comandas: number; readonly items: number };
  readonly cocinaTrasCobrar: { readonly comandas: number; readonly items: number };
  readonly existenciasIniciales: Existencias;
  readonly existenciasTrasDividir: Existencias;
  readonly existenciasTrasLaPrimera: Existencias;
  readonly existenciasFinales: Existencias;
  readonly mesaTrasLaPrimera: { readonly estado: string; readonly orden_activa_id: string | null };
  readonly eventosTrasLaPrimera: number;
  readonly madreTrasDividir: { readonly estado: string; readonly total_centavos: bigint };
}

let e: Escenario;

/** El recorrido de la mesa 1, de que se sienta a que se recoge. */
async function recorrerLaMesa(): Promise<Escenario> {
  const salon = await sembrarSalon({
    nombre: 'Restaurante de las cuentas separadas',
    mesas: 3,
    terminales: 2,
  });
  const sesiones = await abrirLasCajas(salon, FONDO);
  const existenciasIniciales = await existenciasDelSalon(salon);

  const { mesaId, ordenId: madreId } = await sentarYPedir(salon, 0, PEDIDO);
  await pedirLaCuenta(salon, madreId, 1_000);
  const cocinaAntesDeDividir = await fotoDeLaCocina([madreId]);

  const division = await dividirEn(salon, madreId, [
    [
      { platillo: 'arrachera', cantidad: 1 },
      { platillo: 'cerveza', cantidad: 2 },
    ],
    [
      { platillo: 'arrachera', cantidad: 1 },
      { platillo: 'guacamole', cantidad: 1 },
    ],
  ]);
  const [parte1, parte2] = division.hijas;
  if (parte1 === undefined || parte2 === undefined) throw new Error('Debían salir dos partes.');
  const partes = [parte1.ordenId, parte2.ordenId] as const;
  const cocinaTrasDividir = await fotoDeLaCocina([madreId, ...partes]);
  const existenciasTrasDividir = await existenciasDelSalon(salon);
  const madreTrasDividir = await ordenPersistida(madreId);

  // Parte 1: efectivo con cambio, en la caja 1.
  const claveDelCobro1 = clave();
  exigirOk(
    await cobrar(
      ambitoDeCaja(salon, 0),
      partes[0],
      Number(PARTE_1),
      [
        {
          metodo: 'efectivo',
          montoCentavos: Number(PARTE_1),
          recibidoCentavos: RECIBIDO_1,
          propinaCentavos: PROPINA_1,
        },
      ],
      claveDelCobro1,
    ),
    'venta.cobrar (parte 1, efectivo)',
  );
  const mesaTrasLaPrimera = await mesaPersistida(mesaId);
  const eventosTrasLaPrimera = (await eventosDeLaMesa(mesaId)).length;
  const existenciasTrasLaPrimera = await existenciasDelSalon(salon);

  // Parte 2: tarjeta, en la caja 2.
  exigirOk(
    await cobrar(ambitoDeCaja(salon, 1), partes[1], Number(PARTE_2), [
      { metodo: 'tarjeta', montoCentavos: Number(PARTE_2), propinaCentavos: PROPINA_2 },
    ]),
    'venta.cobrar (parte 2, tarjeta)',
  );

  return {
    salon,
    sesiones,
    mesaId,
    madreId,
    partes,
    claveDelCobro1,
    cocinaAntesDeDividir,
    cocinaTrasDividir,
    cocinaTrasCobrar: await fotoDeLaCocina([madreId, ...partes]),
    existenciasIniciales,
    existenciasTrasDividir,
    existenciasTrasLaPrimera,
    existenciasFinales: await existenciasDelSalon(salon),
    mesaTrasLaPrimera,
    eventosTrasLaPrimera,
    madreTrasDividir,
  };
}

beforeAll(async () => {
  e = await recorrerLaMesa();
});

describe('C01 · una cuenta dividida en dos partes, cobrada parte por parte', () => {
  it('lo cobrado por las dos partes es el total de la cuenta madre, al centavo', async () => {
    expect(TOTAL_DE_LA_CUENTA).toBe(86_089n);
    const madre = await ordenPersistida(e.madreId);
    expect(madre.total_centavos, 'el total de la madre cambió al dividir o al cobrar').toBe(
      TOTAL_DE_LA_CUENTA,
    );
    expect(e.madreTrasDividir.total_centavos).toBe(TOTAL_DE_LA_CUENTA);

    expect(await sumaDeLosPagos(e.partes)).toBe(madre.total_centavos);
    expect(await sumaDeLosPagos([e.madreId]), 'la madre tiene pagos propios').toBe(0n);

    // Cada parte pagó exactamente lo que su cuenta vale, y la propina va APARTE de la venta.
    const [parte1, parte2] = await Promise.all(e.partes.map((id) => ordenPersistida(id)));
    expect(parte1).toMatchObject({ estado: 'pagada', total_centavos: PARTE_1, serie: 'A' });
    expect(parte2).toMatchObject({ estado: 'pagada', total_centavos: PARTE_2, serie: 'A' });
    const pagos = await pagosDe(e.partes);
    expect(pagos).toHaveLength(2);
    expect(pagos.reduce((suma, p) => suma + p.propina_centavos, 0n)).toBe(
      BigInt(PROPINA_1 + PROPINA_2),
    );
    // Dos cuentas, dos folios seguidos y distintos.
    expect([parte1?.folio, parte2?.folio]).toEqual([1n, 2n]);
  });

  it('el efectivo con cambio entra al cajón de la caja 1; la tarjeta no toca el de la caja 2', async () => {
    const [caja1, caja2] = e.sesiones;
    if (caja1 === undefined || caja2 === undefined) throw new Error('Debían abrirse dos cajas.');
    const pagos = await pagosDe(e.partes);

    expect(pagos).toContainEqual({
      orden_id: e.partes[0],
      metodo: 'efectivo',
      monto_centavos: PARTE_1,
      propina_centavos: BigInt(PROPINA_1),
      recibido_centavos: BigInt(RECIBIDO_1),
      cambio_centavos: BigInt(CAMBIO_1),
      sesion_caja_id: caja1,
    });
    expect(pagos).toContainEqual({
      orden_id: e.partes[1],
      metodo: 'tarjeta',
      monto_centavos: PARTE_2,
      propina_centavos: BigInt(PROPINA_2),
      recibido_centavos: null,
      cambio_centavos: 0n,
      sesion_caja_id: caja2,
    });

    // El cajón recibe la venta y la propina en billete; el cambio ya salió de lo recibido.
    const db = obtenerDb();
    const arqueo1 = await repoCaja.arqueoDeSesion(db, e.salon.negocio.organizacionId, caja1);
    expect(arqueo1.efectivoEsperadoCentavos).toBe(BigInt(FONDO) + PARTE_1 + BigInt(PROPINA_1));
    expect(arqueo1.ventasCentavos).toBe(PARTE_1);
    // La tarjeta es venta de la caja 2, pero no mueve su cajón.
    const arqueo2 = await repoCaja.arqueoDeSesion(db, e.salon.negocio.organizacionId, caja2);
    expect(arqueo2.efectivoEsperadoCentavos).toBe(BigInt(FONDO));
    expect(arqueo2.ventasCentavos).toBe(PARTE_2);
  });

  it('la madre queda sellada: dividida, sin consumo propio, y no se puede cobrar', async () => {
    const madre = await ordenPersistida(e.madreId);
    expect(madre.estado).toBe('dividida');
    expect(madre.folio, 'la madre se cobró: tiene folio').toBeNull();

    // Las líneas se MUDARON a las partes, no se copiaron: la madre no conserva ninguna.
    const suyas = await obtenerDb()
      .selectFrom('orden_lineas')
      .select('id')
      .where('orden_id', '=', e.madreId)
      .execute();
    expect(suyas, 'la madre conserva líneas que también cobraron sus partes').toEqual([]);

    // Por el comando de producción...
    const intento = await cobrar(ambitoDeCaja(e.salon, 0), e.madreId, Number(TOTAL_DE_LA_CUENTA), [
      { metodo: 'efectivo', montoCentavos: Number(TOTAL_DE_LA_CUENTA) },
    ]);
    expect(intento.ok, 'se pudo cobrar la cuenta madre de una división').toBe(false);
    if (!intento.ok) expect(intento.error.datos?.['regla']).toBe('ORDEN_NO_EDITABLE');
    expect(await pagosDe([e.madreId])).toEqual([]);

    // ...y por la base, que es el segundo cerrojo: aunque alguien se saltara el comando,
    // `pagos_no_sobre_cuenta_sellada` rechaza el pago de una cuenta dividida.
    await expect(
      obtenerDb()
        .insertInto('pagos')
        .values({
          organizacion_id: e.salon.negocio.organizacionId,
          orden_id: e.madreId,
          metodo: 'efectivo',
          monto_centavos: TOTAL_DE_LA_CUENTA,
          estado: 'confirmado',
        })
        .execute(),
    ).rejects.toThrow(/no se cobra/);
    expect(await pagosDe([e.madreId])).toEqual([]);
  });

  it('cada parte tiene SUS líneas y entre las dos suman lo que se pidió', async () => {
    const lineas = await obtenerDb()
      .selectFrom('orden_lineas')
      .select(['orden_id', 'producto_nombre', 'cantidad', 'total_centavos'])
      .where('orden_id', 'in', [...e.partes])
      .execute();
    const de = (parte: string) =>
      lineas
        .filter((l) => l.orden_id === parte)
        .map((l) => `${l.producto_nombre} x${String(Number(l.cantidad))}`)
        .sort();

    expect(de(e.partes[0])).toEqual(['Arrachera al carbón x1', 'Cerveza clara x2']);
    expect(de(e.partes[1])).toEqual(['Arrachera al carbón x1', 'Guacamole con totopos x1']);

    // Lo que cada línea vale suma lo que su cuenta vale, y las dos cuentas suman la madre.
    const sumaDe = (parte: string) =>
      lineas.filter((l) => l.orden_id === parte).reduce((s, l) => s + l.total_centavos, 0n);
    expect(sumaDe(e.partes[0])).toBe(PARTE_1);
    expect(sumaDe(e.partes[1])).toBe(PARTE_2);
    expect(sumaDe(e.partes[0]) + sumaDe(e.partes[1])).toBe(e.madreTrasDividir.total_centavos);
  });

  it('la cocina no se duplica: las mismas comandas y los mismos platos antes y después de cobrar', async () => {
    // Dividir parte la línea de la arrachera en dos filas, y con ella su plato en la comanda: eso
    // es lo único que cambia (3 platos → 4). Cobrar no agrega NADA.
    expect(e.cocinaAntesDeDividir).toEqual({ comandas: 1, items: 3 });
    expect(e.cocinaTrasDividir).toEqual({ comandas: 1, items: 4 });
    expect(e.cocinaTrasCobrar, 'cobrar las partes mandó otra vez el pedido a la plancha').toEqual(
      e.cocinaTrasDividir,
    );

    // Ninguna comanda nació del cobro (esas llevan `cobrado_en`), y cada línea tiene UN plato.
    const db = obtenerDb();
    const nacidasDelCobro = await db
      .selectFrom('comandas')
      .select('id')
      .where('orden_id', 'in', [e.madreId, ...e.partes])
      .where('cobrado_en', 'is not', null)
      .execute();
    expect(nacidasDelCobro).toEqual([]);

    const lineas = await db
      .selectFrom('orden_lineas')
      .select('id')
      .where('orden_id', 'in', [...e.partes])
      .execute();
    const platos = await db
      .selectFrom('comanda_items')
      .select('orden_linea_id')
      .where(
        'orden_linea_id',
        'in',
        lineas.map((l) => l.id),
      )
      .execute();
    expect(platos).toHaveLength(lineas.length);
    expect(new Set(platos.map((p) => p.orden_linea_id)).size).toBe(lineas.length);
  });

  it('el inventario por receta baja UNA vez: dividir no gasta, la primera parte gasta lo suyo y la segunda lo demás', async () => {
    const consumo1 = consumoEsperado([
      { platillo: 'arrachera', cantidad: '1' },
      { platillo: 'cerveza', cantidad: '2' },
    ]);
    const consumoTotal = consumoEsperado(PEDIDO);
    const insumos = Object.keys(consumoTotal) as NombreDeInsumo[];
    const inicial = (i: NombreDeInsumo) => Number(e.existenciasIniciales[i]);

    // Pedir y dividir no tocan el almacén: el inventario se descuenta SÓLO al cobrar.
    expect(e.existenciasTrasDividir).toEqual(e.existenciasIniciales);

    for (const insumo of insumos) {
      expect(e.existenciasTrasLaPrimera[insumo], `${insumo} tras la parte 1`).toBe(
        comoCantidad(inicial(insumo) - consumo1[insumo]),
      );
      expect(e.existenciasFinales[insumo], `${insumo} al final`).toBe(
        comoCantidad(inicial(insumo) - consumoTotal[insumo]),
      );
    }

    // En el ledger: ninguna salida cuelga de la madre, y cada parte saca cada insumo UNA vez.
    const salidas = await obtenerDb()
      .selectFrom('movimientos_stock')
      .select(['referencia_id', 'insumo_id', 'cantidad'])
      .where('organizacion_id', '=', e.salon.negocio.organizacionId)
      .where('tipo', '=', 'salida_venta')
      .execute();
    expect(salidas.some((s) => s.referencia_id === e.madreId)).toBe(false);
    const llaves = salidas.map((s) => `${String(s.referencia_id)}:${s.insumo_id}`);
    expect(new Set(llaves).size, 'un insumo salió dos veces por la misma parte').toBe(
      llaves.length,
    );
    for (const parte of e.partes) {
      expect(salidas.filter((s) => s.referencia_id === parte).length).toBeGreaterThan(0);
    }
  });

  it('la mesa sigue en servicio con la primera parte y pasa a limpieza SÓLO con la última', async () => {
    // Con la primera cobrada, la otra parte sigue sentada esperando su cuenta.
    expect(e.mesaTrasLaPrimera).toMatchObject({
      estado: 'cuenta_solicitada',
      orden_activa_id: e.madreId,
    });

    const mesa = await mesaPersistida(e.mesaId);
    // `orden_activa_id` se conserva: es de qué cuenta viene la mesa mientras se recoge.
    expect(mesa).toMatchObject({ estado: 'limpieza', orden_activa_id: e.madreId });

    const eventos = await eventosDeLaMesa(e.mesaId);
    // Lo único que cobrar cambió es la última transición, y es una sola.
    expect(eventos).toHaveLength(e.eventosTrasLaPrimera + 1);
    const ultimo = eventos[eventos.length - 1];
    expect(ultimo).toMatchObject({
      estado_anterior: 'cuenta_solicitada',
      estado_nuevo: 'limpieza',
      // El ledger conoce la cuenta que abrió la mesa —la madre—, no la parte.
      orden_id: e.madreId,
    });
    expect(huecosEnElLedger(eventos, mesa.estado)).toBeNull();
  });

  it('un cobro no se repite: con la misma clave devuelve lo mismo y con otra se rechaza, sin gastar folio', async () => {
    const db = obtenerDb();
    const folios = () =>
      db
        .selectFrom('folios')
        .select('siguiente')
        .where('sucursal_id', '=', e.salon.sucursal.sucursalId)
        .executeTakeFirstOrThrow();
    const antes = { pagos: (await pagosDe(e.partes)).length, folio: (await folios()).siguiente };

    const otraVez = await cobrar(
      ambitoDeCaja(e.salon, 0),
      e.partes[0],
      Number(PARTE_1),
      [
        {
          metodo: 'efectivo',
          montoCentavos: Number(PARTE_1),
          recibidoCentavos: RECIBIDO_1,
          propinaCentavos: PROPINA_1,
        },
      ],
      e.claveDelCobro1,
    );
    expect(exigirOk(otraVez, 'venta.cobrar (misma clave)').folio).toBe('1');
    expect(otraVez.ok && otraVez.reintento, 'la respuesta no salió de la idempotencia').toBe(true);

    const conOtraClave = await cobrar(ambitoDeCaja(e.salon, 0), e.partes[0], Number(PARTE_1), [
      { metodo: 'efectivo', montoCentavos: Number(PARTE_1) },
    ]);
    expect(conOtraClave.ok, 'la parte ya cobrada se cobró otra vez').toBe(false);
    if (!conOtraClave.ok) expect(conOtraClave.error.datos?.['regla']).toBe('ORDEN_NO_EDITABLE');

    expect({ pagos: (await pagosDe(e.partes)).length, folio: (await folios()).siguiente }).toEqual(
      antes,
    );
  });
});

// ── Dos casos que el recorrido feliz no toca ────────────────────────────────────────────────

/** Una mesa que pidió 2 arracheras y N cervezas, y pidió la cuenta; con tope de descuento. */
async function mesaConCuentaPedida(cervezas: string, nombre: string) {
  const salon = await sembrarSalon({ nombre, mesas: 2, terminales: 2 });
  await abrirLasCajas(salon, FONDO);
  await obtenerDb()
    .insertInto('topes_descuento')
    .values({
      organizacion_id: salon.negocio.organizacionId,
      rol: 'cajero',
      tope_centavos: 200_000n,
      tope_bp: 3_000,
    })
    .execute();
  const { mesaId, ordenId } = await sentarYPedir(salon, 0, [
    { platillo: 'arrachera', cantidad: '2' },
    { platillo: 'cerveza', cantidad: cervezas },
  ]);
  await pedirLaCuenta(salon, ordenId, 1_000);
  return { salon, mesaId, ordenId };
}

function descontar(salon: Salon, ordenId: string, descuentoCentavos: number) {
  return comando(descontarCuenta, {
    entrada: { ordenId, descuentoCentavos, motivo: 'cortesía de la gerente' },
    ambito: ambitoDe(salon.negocio, salon.sucursal.sucursalId, null),
    idempotencyKey: clave(),
  });
}

describe('C01b · una cuenta que YA llevaba descuento cuando se dividió', () => {
  /**
   * Un descuento de $13.37 sobre 2 arracheras y 3 cervezas se reparte entre las líneas, y al
   * dividir cada línea se parte por unidades. Los TRES importes de la línea (subtotal,
   * descuento, total) se reparten por separado, con el centavo sobrante para quien manda el
   * desempate, y no tienen por qué dar la misma cuenta: la parte 1 se lleva el centavo extra
   * del descuento Y el del total, así que su `subtotal − descuento` queda un centavo por debajo
   * de su `total`. Al dividir, `ordenes.total_centavos` de la parte sale del `total`; al cobrar,
   * `cotizar` lo calcula del `subtotal − descuento`. Dos cuentas distintas del mismo plato.
   */
  async function mesaDivididaConDescuento() {
    const { salon, mesaId, ordenId } = await mesaConCuentaPedida('3', 'Restaurante del descuento');
    exigirOk(await descontar(salon, ordenId, 1_337), 'restaurante.descontar_cuenta');
    const division = await dividirEn(salon, ordenId, [
      [
        { platillo: 'arrachera', cantidad: 1 },
        { platillo: 'cerveza', cantidad: 1 },
      ],
      [
        { platillo: 'arrachera', cantidad: 1 },
        { platillo: 'cerveza', cantidad: 2 },
      ],
    ]);
    return { salon, mesaId, madreId: ordenId, partes: division.hijas.map((h) => h.ordenId) };
  }

  it('lo que la parte muestra al dividirse es lo que cobrará: ordenes.total = cotizar', async () => {
    const { salon, partes } = await mesaDivididaConDescuento();
    const diferencias: string[] = [];
    for (const parte of partes) {
      const mostrado = (await ordenPersistida(parte)).total_centavos;
      const { totales } = await cotizar(obtenerDb(), salon.negocio.organizacionId, parte);
      if (mostrado !== totales.totalCentavos) {
        diferencias.push(
          `la parte ${parte} se muestra en ${String(mostrado)} y se cobraría en ${String(totales.totalCentavos)}`,
        );
      }
    }
    expect(diferencias, 'la pantalla de cuentas separadas enseña un total que no se cobra').toEqual(
      [],
    );
  });

  it('las dos partes se cobran por el total que se les enseñó, suman la madre y recogen la mesa', async () => {
    const { salon, mesaId, madreId, partes } = await mesaDivididaConDescuento();
    const madre = await ordenPersistida(madreId);

    for (const [i, parte] of partes.entries()) {
      const mostrado = Number((await ordenPersistida(parte)).total_centavos);
      exigirOk(
        await cobrar(ambitoDeCaja(salon, i), parte, mostrado, [
          { metodo: 'efectivo', montoCentavos: mostrado },
        ]),
        `venta.cobrar (parte ${String(i + 1)}, por el total que enseñó la división)`,
      );
    }

    expect(await sumaDeLosPagos(partes)).toBe(madre.total_centavos);
    expect((await mesaPersistida(mesaId)).estado).toBe('limpieza');
  });
});

describe('C01c · el descuento que se da a una PARTE ya dividida', () => {
  /**
   * `restaurante.descontar_cuenta` acepta expresamente «la parte de una cuenta dividida»
   * (`motivoParaNoDescontar`, y su prueba unitaria lo dice). Pero bajar el total de una parte
   * deja a la madre con un total que ya no es la suma de sus hijas, y el trigger diferido de la
   * 070 (`division_cuadra`) lo rechaza al confirmar: «La división no cuadra». La cajera lee
   * «Algo falló de nuestro lado» y no hay nada que pueda hacer. O se aplica y los libros siguen
   * cuadrando, o se rechaza con una regla de negocio que se pueda leer; lo que no puede ser es
   * un error interno.
   */
  it('o se aplica con los libros cuadrados, o se rechaza con una regla: nunca «Algo falló»', async () => {
    const { salon, ordenId } = await mesaConCuentaPedida(
      '2',
      'Restaurante del descuento a una parte',
    );
    const division = await dividirEn(salon, ordenId, [
      [
        { platillo: 'arrachera', cantidad: 1 },
        { platillo: 'cerveza', cantidad: 1 },
      ],
      [
        { platillo: 'arrachera', cantidad: 1 },
        { platillo: 'cerveza', cantidad: 1 },
      ],
    ]);
    const [primera] = division.hijas;
    if (primera === undefined) throw new Error('La división debía dar partes.');

    const salida = await descontar(salon, primera.ordenId, 1_000);

    if (salida.ok) {
      // Aplicado: la madre y sus hijas siguen cuadrando.
      const madre = await ordenPersistida(ordenId);
      const hijas = await Promise.all(division.hijas.map((h) => ordenPersistida(h.ordenId)));
      expect(hijas.reduce((suma, h) => suma + h.total_centavos, 0n)).toBe(madre.total_centavos);
    } else {
      expect(
        salida.error.codigo,
        `descontar a una parte reventó con ${JSON.stringify(salida.error)}`,
      ).toBe('REGLA_DE_NEGOCIO');
    }
  });
});

describe('C01d · un negocio con el IVA FUERA del precio', () => {
  /**
   * `configuracion.impuesto.incluidoEnPrecio = false` es una opción que el dueño guarda en
   * Configuración (`guardarConfiguracion`): el precio del menú no lleva IVA y la cuenta se lo
   * suma encima. La cuenta madre vale entonces subtotal + IVA, pero `dividir_cuenta` reparte los
   * importes de las LÍNEAS, que no llevan IVA, así que las hijas suman menos que la madre y el
   * trigger diferido de la 070 (`division_cuadra`) rechaza la división al confirmar. Con esa
   * opción, dividir una cuenta responde «Algo falló de nuestro lado» SIEMPRE.
   */
  it('dividir la cuenta no revienta: las partes se cobran y suman lo que valía la cuenta', async () => {
    const salon = await sembrarSalon({
      nombre: 'Restaurante con el IVA aparte',
      mesas: 2,
      terminales: 2,
    });
    await abrirLasCajas(salon, FONDO);
    await obtenerDb()
      .insertInto('configuracion')
      .values({
        organizacion_id: salon.negocio.organizacionId,
        valores: JSON.stringify({ impuesto: { puntosBase: 1_600, incluidoEnPrecio: false } }),
      })
      .execute();
    const { mesaId, ordenId } = await sentarYPedir(salon, 0, [
      { platillo: 'arrachera', cantidad: '2' },
      { platillo: 'cerveza', cantidad: '3' },
    ]);
    await pedirLaCuenta(salon, ordenId, 1_000);

    const division = await dividirEn(salon, ordenId, [
      [
        { platillo: 'arrachera', cantidad: 1 },
        { platillo: 'cerveza', cantidad: 1 },
      ],
      [
        { platillo: 'arrachera', cantidad: 1 },
        { platillo: 'cerveza', cantidad: 2 },
      ],
    ]);

    const partes = division.hijas.map((h) => h.ordenId);
    for (const [i, parte] of partes.entries()) {
      const mostrado = Number((await ordenPersistida(parte)).total_centavos);
      exigirOk(
        await cobrar(ambitoDeCaja(salon, i), parte, mostrado, [
          { metodo: 'efectivo', montoCentavos: mostrado },
        ]),
        `venta.cobrar (parte ${String(i + 1)})`,
      );
    }
    expect(await sumaDeLosPagos(partes)).toBe((await ordenPersistida(ordenId)).total_centavos);
    expect((await mesaPersistida(mesaId)).estado).toBe('limpieza');
  });
});
