import { obtenerDb } from '@morphiqpos/data';
import { beforeAll, describe, expect, it } from 'vitest';

import { comando } from '../produccion.ts';
import { clave, exigirOk } from '../pruebas/negocio-real.ts';
import { cancelarOrden } from './cancelacion.ts';
import { cambiarMesaComando } from './cambio-de-mesa.ts';
import { liberarMesa } from './mesas.ts';
import {
  PRECIO_ARRACHERA,
  PRECIO_CERVEZA,
  abrirLasCajas,
  ambitoDeCaja,
  cobrar,
  cobrarExacto,
  comoCantidad,
  comoTexto,
  consumoEsperado,
  dividirEn,
  eventosDeLaMesa,
  existenciasDelSalon,
  fotoDeLaCocina,
  huecosEnElLedger,
  mesaDe,
  mesaPersistida,
  ordenPersistida,
  pagosDe,
  pedirLaCuenta,
  sembrarSalon,
  sentarYPedir,
  sumaDeLosPagos,
  type NombreDeInsumo,
  type PlatilloPedido,
  type Salon,
} from './pruebas/salon-real.ts';
import { unirMesasComando } from './union-de-mesas.ts';

/**
 * C05 · CAMBIAR DE MESA Y COBRAR EN LA NUEVA, y UNIR DOS MESAS Y COBRAR EL GRUPO, contra Postgres
 * (cierre del restaurante, 21-10).
 *
 * Las dos operaciones mueven una cuenta viva por el salón sin tocar el dinero, y las dos terminan
 * en el mismo punto: el cobro, que es quien tiene que dejar las mesas donde el mapa las espera.
 * La base falsa de `cambio-de-mesa.test.ts` y `union-de-mesas.test.ts` prueba cada comando por
 * separado; aquí se encadenan con el cobro por los comandos de producción y se LEE la base:
 * `mesas`, `ordenes`, `comandas`, `eventos_mesa`, `pagos`, `existencias`.
 *
 * ── Qué es «recoger» una mesa ─────────────────────────────────────────────────
 * `pasarMesaCobradaALimpieza` (`mesas-escrituras.ts`) es quien lo define: al cobrar, la mesa que
 * tiene la cuenta por `orden_activa_id` pasa a `limpieza` —no a `libre`: hay platos encima— y
 * `orden_activa_id` se CONSERVA, para saber de qué cuenta viene. El paso a `libre` lo da quien
 * limpia, con «mesa limpia» (`restaurante.liberar_mesa`). En una cuenta dividida la recoge la
 * última parte. Y en un GRUPO de mesas unidas sólo la recoge la PRINCIPAL, porque es la única
 * que tiene la cuenta por `orden_activa_id`: las mesas miembro no se tocan. De eso trata C05b.
 */

const PEDIDO_DE_LA_MUDANZA: readonly PlatilloPedido[] = [
  { platillo: 'arrachera', cantidad: '2' },
  { platillo: 'cerveza', cantidad: '2' },
];
const TOTAL_DE_LA_MUDANZA = Number(2n * PRECIO_ARRACHERA + 2n * PRECIO_CERVEZA);

// ── C05a · cambiar de mesa y cobrar en la nueva ─────────────────────────────────────────────

interface Mudanza {
  readonly salon: Salon;
  readonly ordenId: string;
  readonly viejaId: string;
  readonly nuevaId: string;
  readonly ocupadaDesdeAntes: Date | null;
  readonly cocinaAntes: { readonly comandas: number; readonly items: number };
  readonly existenciasIniciales: Record<NombreDeInsumo, string>;
  readonly viejaTrasMudarse: Awaited<ReturnType<typeof mesaCompleta>>;
  readonly nuevaTrasMudarse: Awaited<ReturnType<typeof mesaCompleta>>;
  readonly comandasTrasMudarse: readonly { readonly mesa_id: string | null }[];
}

function mesaCompleta(mesaId: string) {
  return obtenerDb()
    .selectFrom('mesas')
    .select([
      'numero',
      'estado',
      'orden_activa_id',
      'personas_actuales',
      'ocupada_desde',
      'cliente_temporal',
      'empleado_atiende_id',
    ])
    .where('id', '=', mesaId)
    .executeTakeFirstOrThrow();
}

function comandasDe(ordenId: string) {
  return obtenerDb()
    .selectFrom('comandas')
    .select(['mesa_id', 'estado'])
    .where('orden_id', '=', ordenId)
    .execute();
}

let mudanza: Mudanza;

/** La mesa 1 pide, se pasa a la 3, pide la cuenta y paga en efectivo. */
async function mudarYCobrar(): Promise<Mudanza> {
  const salon = await sembrarSalon({
    nombre: 'Restaurante de la terraza',
    mesas: 4,
    terminales: 1,
  });
  await abrirLasCajas(salon);
  const existenciasIniciales = await existenciasDelSalon(salon);
  const { mesaId: viejaId, ordenId } = await sentarYPedir(salon, 0, PEDIDO_DE_LA_MUDANZA);
  const nuevaId = mesaDe(salon, 2);
  const ocupadaDesdeAntes = (await mesaCompleta(viejaId)).ocupada_desde;
  const cocinaAntes = await fotoDeLaCocina([ordenId]);

  const cambio = exigirOk(
    await comando(cambiarMesaComando, {
      entrada: { ordenId, mesaDestinoId: nuevaId },
      ambito: ambitoDeCaja(salon),
      idempotencyKey: clave(),
    }),
    'restaurante.cambiar_mesa',
  );
  expect(cambio.comandasReapuntadas).toBe(1);
  const viejaTrasMudarse = await mesaCompleta(viejaId);
  const nuevaTrasMudarse = await mesaCompleta(nuevaId);
  const comandasTrasMudarse = await comandasDe(ordenId);

  await pedirLaCuenta(salon, ordenId, 1_000);
  exigirOk(
    await cobrarExacto(ambitoDeCaja(salon), ordenId, TOTAL_DE_LA_MUDANZA),
    'venta.cobrar (en la mesa nueva)',
  );

  return {
    salon,
    ordenId,
    viejaId,
    nuevaId,
    ocupadaDesdeAntes,
    cocinaAntes,
    existenciasIniciales,
    viejaTrasMudarse,
    nuevaTrasMudarse,
    comandasTrasMudarse,
  };
}

describe('C05a · cambiar de mesa y cobrar en la nueva', () => {
  beforeAll(async () => {
    mudanza = await mudarYCobrar();
  });

  it('la mesa vieja queda libre, sin cuenta y sin comensales, y así sigue después del cobro', async () => {
    const libre = {
      estado: 'libre',
      orden_activa_id: null,
      personas_actuales: 0,
      ocupada_desde: null,
      cliente_temporal: null,
      empleado_atiende_id: null,
    };
    expect(mudanza.viejaTrasMudarse).toMatchObject(libre);
    expect(await mesaCompleta(mudanza.viejaId), 'el cobro tocó la mesa vieja').toMatchObject(libre);
  });

  it('la mesa nueva se queda con la cuenta y con el reloj de ocupación de la vieja, y pasa a limpieza al cobrar', async () => {
    // La cuenta se mudó con su ocupación: el reloj NO arranca de nuevo (F-305).
    expect(mudanza.ocupadaDesdeAntes).not.toBeNull();
    expect(mudanza.nuevaTrasMudarse.ocupada_desde).toEqual(mudanza.ocupadaDesdeAntes);
    expect(mudanza.nuevaTrasMudarse).toMatchObject({
      orden_activa_id: mudanza.ordenId,
      personas_actuales: 4,
    });
    expect(mudanza.nuevaTrasMudarse.estado).not.toBe('libre');

    // Al cobrar, la mesa NUEVA —no la vieja— pasa a limpieza, con la cuenta pagada apuntando a ella.
    expect(await mesaCompleta(mudanza.nuevaId)).toMatchObject({
      estado: 'limpieza',
      orden_activa_id: mudanza.ordenId,
    });
    expect(await ordenPersistida(mudanza.ordenId)).toMatchObject({
      estado: 'pagada',
      mesa_id: mudanza.nuevaId,
    });
  });

  it('la comanda viva sigue a la cuenta: apunta a la mesa nueva y el cobro no la duplica', async () => {
    expect(mudanza.cocinaAntes).toEqual({ comandas: 1, items: 2 });
    // Reapuntada al mudarse...
    expect(mudanza.comandasTrasMudarse).toEqual([
      expect.objectContaining({ mesa_id: mudanza.nuevaId }),
    ]);
    // ...y después del cobro: la misma, en la mesa nueva, con los mismos platos.
    expect(await comandasDe(mudanza.ordenId)).toEqual([
      expect.objectContaining({ mesa_id: mudanza.nuevaId, estado: 'nuevo' }),
    ]);
    expect(await fotoDeLaCocina([mudanza.ordenId])).toEqual(mudanza.cocinaAntes);
  });

  it('el ledger de cada mesa es una cadena sin huecos que termina donde la mesa está', async () => {
    const vieja = await eventosDeLaMesa(mudanza.viejaId);
    const nueva = await eventosDeLaMesa(mudanza.nuevaId);

    expect(huecosEnElLedger(vieja, 'libre'), comoTexto(vieja)).toBeNull();
    expect(huecosEnElLedger(nueva, 'limpieza'), comoTexto(nueva)).toBeNull();

    // La vieja termina en libre y la cuenta ya no figura en esa transición; la nueva arranca de
    // libre con la cuenta que llegó y termina recogida por el cobro.
    expect(vieja[vieja.length - 1]).toMatchObject({ estado_nuevo: 'libre', orden_id: null });
    expect(nueva[0]).toMatchObject({ estado_anterior: 'libre', orden_id: mudanza.ordenId });
    expect(nueva[nueva.length - 1]).toMatchObject({
      estado_anterior: 'cuenta_solicitada',
      estado_nuevo: 'limpieza',
      orden_id: mudanza.ordenId,
    });
  });

  it('el dinero y el almacén: UN pago por el total de la cuenta, un folio, y el inventario baja una vez', async () => {
    const pagos = await pagosDe([mudanza.ordenId]);
    expect(pagos).toHaveLength(1);
    expect(pagos[0]).toMatchObject({
      metodo: 'efectivo',
      monto_centavos: BigInt(TOTAL_DE_LA_MUDANZA),
    });
    expect(await ordenPersistida(mudanza.ordenId)).toMatchObject({
      total_centavos: BigInt(TOTAL_DE_LA_MUDANZA),
      folio: 1n,
    });

    const gasto = consumoEsperado(PEDIDO_DE_LA_MUDANZA);
    const hoy = await existenciasDelSalon(mudanza.salon);
    for (const insumo of Object.keys(gasto) as NombreDeInsumo[]) {
      expect(hoy[insumo], insumo).toBe(
        comoCantidad(Number(mudanza.existenciasIniciales[insumo]) - gasto[insumo]),
      );
    }
  });
});

describe('C05c · cambiar de mesa y DESPUÉS dividir la cuenta', () => {
  it('la mesa nueva se recoge con la última parte y la vieja sigue libre', async () => {
    const salon = await sembrarSalon({
      nombre: 'Restaurante de la mudanza dividida',
      mesas: 4,
      terminales: 2,
    });
    await abrirLasCajas(salon);
    const { mesaId: viejaId, ordenId } = await sentarYPedir(salon, 0, PEDIDO_DE_LA_MUDANZA);
    const nuevaId = mesaDe(salon, 3);
    exigirOk(
      await comando(cambiarMesaComando, {
        entrada: { ordenId, mesaDestinoId: nuevaId },
        ambito: ambitoDeCaja(salon),
        idempotencyKey: clave(),
      }),
      'restaurante.cambiar_mesa',
    );
    await pedirLaCuenta(salon, ordenId);
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
    const [primera, segunda] = division.hijas;
    if (primera === undefined || segunda === undefined) throw new Error('Debían salir dos partes.');

    exigirOk(
      await cobrarExacto(ambitoDeCaja(salon, 0), primera.ordenId, Number(primera.totalCentavos)),
      'venta.cobrar (parte 1)',
    );
    expect((await mesaCompleta(nuevaId)).estado, 'la primera parte recogió la mesa').toBe(
      'cuenta_solicitada',
    );
    exigirOk(
      await cobrarExacto(ambitoDeCaja(salon, 1), segunda.ordenId, Number(segunda.totalCentavos)),
      'venta.cobrar (parte 2)',
    );

    expect(await mesaCompleta(nuevaId)).toMatchObject({
      estado: 'limpieza',
      orden_activa_id: ordenId,
    });
    expect(await mesaCompleta(viejaId)).toMatchObject({ estado: 'libre', orden_activa_id: null });
    expect(await sumaDeLosPagos([primera.ordenId, segunda.ordenId])).toBe(
      (await ordenPersistida(ordenId)).total_centavos,
    );
    const eventos = await eventosDeLaMesa(nuevaId);
    expect(huecosEnElLedger(eventos, 'limpieza'), comoTexto(eventos)).toBeNull();
  });
});

// ── C05b · unir dos mesas y cobrar el grupo UNA vez ─────────────────────────────────────────

const PEDIDO_DE_A: readonly PlatilloPedido[] = [{ platillo: 'arrachera', cantidad: '1' }];
const PEDIDO_DE_B: readonly PlatilloPedido[] = [{ platillo: 'cerveza', cantidad: '2' }];
const TOTAL_DEL_GRUPO = Number(PRECIO_ARRACHERA + 2n * PRECIO_CERVEZA);
const EFECTIVO_DEL_GRUPO = 20_000;

interface Grupo {
  readonly salon: Salon;
  readonly a: { readonly mesaId: string; readonly ordenId: string };
  readonly b: { readonly mesaId: string; readonly ordenId: string };
  readonly unionId: string;
  readonly cocinaAntesDeUnir: { readonly comandas: number; readonly items: number };
  readonly existenciasIniciales: Record<NombreDeInsumo, string>;
}

/** Las mesas 1 y 2 piden por separado, se juntan, piden la cuenta del grupo y la pagan UNA vez. */
async function unirYCobrar(nombre: string): Promise<Grupo> {
  const salon = await sembrarSalon({ nombre, mesas: 4, terminales: 1 });
  await abrirLasCajas(salon);
  const existenciasIniciales = await existenciasDelSalon(salon);
  const a = await sentarYPedir(salon, 0, PEDIDO_DE_A);
  const b = await sentarYPedir(salon, 1, PEDIDO_DE_B);
  const cocinaAntesDeUnir = await fotoDeLaCocina([a.ordenId, b.ordenId]);

  const union = exigirOk(
    await comando(unirMesasComando, {
      entrada: { mesaPrincipalId: a.mesaId, mesaIds: [b.mesaId] },
      ambito: ambitoDeCaja(salon),
      idempotencyKey: clave(),
    }),
    'restaurante.unir_mesas',
  );
  expect(union.totalCentavos).toBe(String(TOTAL_DEL_GRUPO));
  await pedirLaCuenta(salon, a.ordenId, 1_000);

  // UN solo juego de pagos, mixto: billete de 200 y el resto con tarjeta.
  exigirOk(
    await cobrar(ambitoDeCaja(salon), a.ordenId, TOTAL_DEL_GRUPO, [
      {
        metodo: 'efectivo',
        montoCentavos: EFECTIVO_DEL_GRUPO,
        recibidoCentavos: EFECTIVO_DEL_GRUPO,
      },
      { metodo: 'tarjeta', montoCentavos: TOTAL_DEL_GRUPO - EFECTIVO_DEL_GRUPO },
    ]),
    'venta.cobrar (el grupo)',
  );
  return { salon, a, b, unionId: union.unionId, cocinaAntesDeUnir, existenciasIniciales };
}

describe('C05b · unir dos mesas y cobrar el grupo UNA vez', () => {
  let grupo: Grupo;

  beforeAll(async () => {
    grupo = await unirYCobrar('Restaurante del grupo de diez');
  });

  it('un solo juego de pagos por el total de las dos cuentas; la absorbida queda en cero, sin pagos y sin poder cobrarse', async () => {
    const pagosDelGrupo = await pagosDe([grupo.a.ordenId]);
    expect(pagosDelGrupo.map((p) => [p.metodo, p.monto_centavos])).toEqual([
      ['efectivo', BigInt(EFECTIVO_DEL_GRUPO)],
      ['tarjeta', BigInt(TOTAL_DEL_GRUPO - EFECTIVO_DEL_GRUPO)],
    ]);
    expect(await sumaDeLosPagos([grupo.a.ordenId])).toBe(BigInt(TOTAL_DEL_GRUPO));
    expect(await pagosDe([grupo.b.ordenId]), 'la cuenta absorbida tiene pagos propios').toEqual([]);

    expect(await ordenPersistida(grupo.a.ordenId)).toMatchObject({
      estado: 'pagada',
      total_centavos: BigInt(TOTAL_DEL_GRUPO),
      folio: 1n,
    });
    expect(await ordenPersistida(grupo.b.ordenId)).toMatchObject({
      estado: 'absorbida',
      total_centavos: 0n,
      folio: null,
    });

    // La absorbida no se cobra: por el comando...
    const intento = await cobrar(ambitoDeCaja(grupo.salon), grupo.b.ordenId, 0, [
      { metodo: 'efectivo', montoCentavos: 11_110 },
    ]);
    expect(intento.ok, 'se pudo cobrar la cuenta absorbida').toBe(false);
    // ...y por la base, que es el segundo cerrojo.
    await expect(
      obtenerDb()
        .insertInto('pagos')
        .values({
          organizacion_id: grupo.salon.negocio.organizacionId,
          orden_id: grupo.b.ordenId,
          metodo: 'efectivo',
          monto_centavos: 11_110n,
          estado: 'confirmado',
        })
        .execute(),
    ).rejects.toThrow(/no se cobra/);
  });

  it('el consumo de las dos mesas se cobra una vez: la cocina no se duplica y el almacén baja una sola vez', async () => {
    // Las comandas de la absorbida siguen en la cocina con sus platos; cobrar no manda nada más.
    expect(grupo.cocinaAntesDeUnir).toEqual({ comandas: 2, items: 2 });
    expect(await fotoDeLaCocina([grupo.a.ordenId, grupo.b.ordenId])).toEqual(
      grupo.cocinaAntesDeUnir,
    );

    const gasto = consumoEsperado([...PEDIDO_DE_A, ...PEDIDO_DE_B]);
    const hoy = await existenciasDelSalon(grupo.salon);
    for (const insumo of Object.keys(gasto) as NombreDeInsumo[]) {
      expect(hoy[insumo], insumo).toBe(
        comoCantidad(Number(grupo.existenciasIniciales[insumo]) - gasto[insumo]),
      );
    }
  });

  it('la mesa PRINCIPAL pasa a limpieza con su cuenta pagada: eso es lo que hoy significa «recogida»', async () => {
    expect(await mesaPersistida(grupo.a.mesaId)).toMatchObject({
      estado: 'limpieza',
      orden_activa_id: grupo.a.ordenId,
    });
    const eventos = await eventosDeLaMesa(grupo.a.mesaId);
    expect(eventos[eventos.length - 1]).toMatchObject({
      estado_anterior: 'cuenta_solicitada',
      estado_nuevo: 'limpieza',
    });
    expect(huecosEnElLedger(eventos, 'limpieza'), comoTexto(eventos)).toBeNull();
  });

  /**
   * Estuvo en ROJO hasta el cierre del 21-10 (`cerrarElGrupoDeLaMesa`). El cobro del grupo
   * recogía a la principal y se olvidaba de las demás: `mesaDeLaCuenta` sólo
   * encuentra la mesa que tiene la cuenta por `orden_activa_id`, y las mesas miembro la tienen en
   * NULL a propósito (`unirMesas`: es lo que impide comandar en la 5 mientras el grupo se cobra en
   * la 4). Se quedan en el estado que tenía la principal al juntarse —aquí `pedido_enviado`, que
   * el mapa rotula «Pedido enviado»— con una cuenta ya pagada que nadie les dice.
   */
  it('las mesas MIEMBRO del grupo también quedan recogidas (limpieza) al cobrarlo', async () => {
    const miembro = await mesaPersistida(grupo.b.mesaId);
    expect(
      miembro.estado,
      `la mesa ${String(miembro.numero)} del grupo se quedó en «${miembro.estado}» con la cuenta del grupo ya pagada: ${comoTexto(miembro)}`,
    ).toBe('limpieza');
  });

  /**
   * Estuvo en ROJO hasta el cierre del 21-10, y es lo que el mesero VEÍA: después de cobrar el
   * grupo, «mesa limpia» no liberaba ninguna de
   * las dos mesas. `liberar_mesa` rechaza una mesa de un grupo vivo («sepáralas antes de
   * liberarla»), la unión sigue abierta porque nadie la cierra, y `restaurante.separar_mesas` —que
   * la cerraría— existe como ruta pero ninguna pantalla lo llama.
   */
  it('«mesa limpia» devuelve al servicio cada mesa del grupo ya cobrado', async () => {
    const otro = await unirYCobrar('Restaurante del grupo que se va');
    const rechazos: string[] = [];
    for (const [nombre, mesaId] of [
      ['la principal', otro.a.mesaId],
      ['la miembro', otro.b.mesaId],
    ] as const) {
      const salida = await comando(liberarMesa, {
        entrada: { mesaId },
        ambito: ambitoDeCaja(otro.salon),
        idempotencyKey: clave(),
      });
      if (!salida.ok) rechazos.push(`«mesa limpia» en ${nombre}: ${salida.error.mensaje}`);
    }
    expect(rechazos, 'ninguna mesa del grupo cobrado se puede liberar desde «mesa limpia»').toEqual(
      [],
    );

    expect((await mesaPersistida(otro.a.mesaId)).estado).toBe('libre');
    expect((await mesaPersistida(otro.b.mesaId)).estado).toBe('libre');
  });
});

// ── D-7 · cancelar la cuenta de un grupo: la comanda de la mesa unida también se cancela ────────

/**
 * Lo encontró la suite de operaciones (D-7, cierre del 21-10). Al unir mesas, las LÍNEAS pasan a
 * la cuenta principal pero cada comanda sigue colgada de la cuenta que se absorbió; cancelar la
 * cuenta del grupo cancelaba sólo las comandas de la principal, y el plato de la mesa unida se
 * quedaba «nuevo» en el tablero de la cocina —para una mesa ya libre, que puede estar sentando a
 * otra gente—.
 */
describe('D-7 · cancelar la cuenta de un grupo de mesas unidas', () => {
  it('ninguna comanda del grupo queda viva en la cocina y las dos mesas quedan libres', async () => {
    const salon = await sembrarSalon({
      nombre: 'Restaurante del grupo que se cancela',
      mesas: 4,
      terminales: 1,
    });
    await abrirLasCajas(salon);
    const a = await sentarYPedir(salon, 0, PEDIDO_DE_A);
    const b = await sentarYPedir(salon, 1, PEDIDO_DE_B);
    exigirOk(
      await comando(unirMesasComando, {
        entrada: { mesaPrincipalId: a.mesaId, mesaIds: [b.mesaId] },
        ambito: ambitoDeCaja(salon),
        idempotencyKey: clave(),
      }),
      'restaurante.unir_mesas',
    );

    exigirOk(
      await comando(cancelarOrden, {
        entrada: { ordenId: a.ordenId, motivo: 'se levantaron antes de que saliera la comida' },
        ambito: ambitoDeCaja(salon),
        idempotencyKey: clave(),
      }),
      'restaurante.cancelar_orden (el grupo)',
    );

    const db = obtenerDb();
    const comandas = await db
      .selectFrom('comandas')
      .select(['id', 'orden_id', 'estado'])
      .where('orden_id', 'in', [a.ordenId, b.ordenId])
      .execute();
    expect(
      comandas.filter((c) => c.orden_id === b.ordenId).length,
      'la mesa unida mandó su comanda',
    ).toBeGreaterThan(0);
    expect(
      comandas.filter((c) => c.estado !== 'cancelado').map((c) => `${c.orden_id}: ${c.estado}`),
      'comandas del grupo que la cocina sigue viendo',
    ).toEqual([]);
    const items = await db
      .selectFrom('comanda_items')
      .select('estado')
      .where(
        'comanda_id',
        'in',
        comandas.map((c) => c.id),
      )
      .execute();
    expect(items.filter((i) => i.estado !== 'cancelado')).toEqual([]);

    expect((await mesaPersistida(a.mesaId)).estado).toBe('libre');
    expect((await mesaPersistida(b.mesaId)).estado).toBe('libre');
  });
});
