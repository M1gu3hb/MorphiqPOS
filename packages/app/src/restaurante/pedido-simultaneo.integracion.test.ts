import type { Resultado } from '@morphiqpos/contracts';
import { obtenerDb } from '@morphiqpos/data';
import { beforeAll, describe, expect, it } from 'vitest';

import { comando } from '../produccion.ts';
import { enCarrera } from '../pruebas/carrera.ts';
import {
  ambitoDe,
  clave,
  exigirOk,
  sembrarNegocio,
  sembrarSucursal,
  type NegocioReal,
  type SucursalReal,
} from '../pruebas/negocio-real.ts';
import { anularLineaComando } from './anulacion-linea.ts';
import { solicitarCuenta } from './cuenta.ts';
import { descontarCuenta } from './descuento-de-cuenta.ts';
import { abrirMesa } from './mesas.ts';
import { enviarPedido } from './pedido.ts';

/**
 * DOS COSAS A LA MISMA CUENTA A LA VEZ, contra Postgres (día completo del restaurante, 2.4).
 *
 * Dos meseros —o un mesero y el gerente que lo ayuda— mandan platos a la MISMA mesa en el mismo
 * instante. Cada pedido escribe sus líneas, cotiza la cuenta y guarda el total; sin candado los
 * dos leían «la cuenta vale $X» antes de que el otro confirmara, cada uno sumaba SUS platos
 * sobre ese $X y el que confirmaba después pisaba al primero. La cuenta quedaba con $823 de
 * platos dentro y un total de $165 —o de $658—, que es la cifra que lee la caja. El día
 * completo lo destapó con dos tabletas (seis de cada ocho rondas salían mal).
 *
 * Lo mismo pasa con cualquier comando que recalcula el total: pedir la cuenta mientras entra el
 * postre, o dos anulaciones de platillos distintos. Por eso el candado (`for update` sobre la
 * fila de la cuenta, al cargarla) lo toman todos: `ordenDeMesa` para los de mesa y su propio
 * cargador `anular_linea`, `descontar_cuenta` y `dividir_cuenta`.
 *
 * La base falsa no puede probarlo: no tiene bloqueos ni espera a otra transacción.
 *
 * ── La barrera ────────────────────────────────────────────────────────────
 * `enCarrera` retiene la fila de la cuenta desde la prueba (`retenerLaCuenta`). Con el candado
 * del comando, las dos corredoras se forman en su primera lectura y entran una detrás de otra.
 * SIN él, leen las dos, escriben sus líneas, cotizan sobre lo que veían y se forman al guardar
 * el total: la segunda pisa a la primera. Quitar `for update` de `ordenDeMesa` hace fallar los
 * dos primeros casos; quitárselo a `anular_linea`, el tercero; y a `descontar_cuenta`, el cuarto.
 * Que CADA comando toma el candado al cargar la cuenta —incluido `dividir_cuenta`, cuya carrera
 * no se puede forzar con una barrera— lo prueba `candado-de-la-cuenta.integracion.test.ts`.
 */

const PRECIO_ARRACHERA = 32_900n;
const PRECIO_CERVEZA = 5_500n;
const PRECIO_SOPA = 11_500n;

let negocio: NegocioReal;
let sucursal: SucursalReal;
let arrachera = '';
let cerveza = '';
let sopa = '';
let mesas: readonly string[] = [];

const ambito = () => ambitoDe(negocio, sucursal.sucursalId, null);
/** Quien anula es de caja o de dirección: el mesero no puede (`anulacion-linea.ts`). */
const ambitoDeLaGerente = () => ({ ...ambito(), rol: 'gerente' as const });

beforeAll(async () => {
  negocio = await sembrarNegocio({
    nombre: 'Restaurante de las dos tabletas',
    rol: 'mesero',
    giro: 'restaurante',
    paquete: 'restaurante',
  });
  sucursal = await sembrarSucursal(negocio, { terminales: [] });
  const db = obtenerDb();
  await db
    .insertInto('estaciones_preparacion')
    .values({ organizacion_id: negocio.organizacionId, nombre: 'Cocina general', es_general: true })
    .execute();
  const producto = async (nombre: string, precio: bigint): Promise<string> =>
    (
      await db
        .insertInto('productos')
        .values({
          organizacion_id: negocio.organizacionId,
          nombre,
          precio_venta_centavos: precio,
          costo_unitario_centavos: precio / 2n,
          estrategia_consumo: 'ninguno',
          area_preparacion: 'cocina',
        })
        .returning('id')
        .executeTakeFirstOrThrow()
    ).id;
  // El tope de descuento de la gerente: un tope que no existe se lee como CERO, y el descuento
  // del caso 4 tiene que caber en el suyo para que el comando llegue a recalcular la cuenta.
  await db
    .insertInto('topes_descuento')
    .values({
      organizacion_id: negocio.organizacionId,
      rol: 'gerente',
      tope_centavos: 200_000n,
      tope_bp: 3_000,
    })
    .execute();
  arrachera = await producto('Arrachera al carbón', PRECIO_ARRACHERA);
  cerveza = await producto('Cerveza clara', PRECIO_CERVEZA);
  sopa = await producto('Sopa de tortilla', PRECIO_SOPA);
  // Una mesa por caso: cada uno trabaja su propia cuenta.
  mesas = (
    await db
      .insertInto('mesas')
      .values(
        [1, 2, 3, 4].map((numero) => ({
          organizacion_id: negocio.organizacionId,
          sucursal_id: sucursal.sucursalId,
          numero,
        })),
      )
      .returning('id')
      .execute()
  ).map((m) => m.id);
});

async function abrir(indice: number): Promise<string> {
  const abierta = await comando(abrirMesa, {
    entrada: { mesaId: mesas[indice] ?? '', personas: 2 },
    ambito: ambito(),
    idempotencyKey: clave(),
  });
  return exigirOk(abierta, 'restaurante.abrir_mesa').ordenId;
}

function pedir(ordenId: string, productoId: string, cantidad: string) {
  return comando(enviarPedido, {
    entrada: { ordenId, lineas: [{ productoId, cantidad }] },
    ambito: ambito(),
    idempotencyKey: clave(),
  });
}

function anular(ordenId: string, lineaId: string) {
  return comando(anularLineaComando, {
    entrada: { ordenId, lineaId, motivo: 'error_mesero' },
    ambito: ambitoDeLaGerente(),
    idempotencyKey: clave(),
  });
}

/**
 * La retención de la barrera: la fila de la cuenta, tomada desde la prueba con `for no key
 * update`. Detiene a quien escribe la cuenta o la lee `for update` —el candado que se prueba—,
 * y NO detiene la inserción de una línea o de un movimiento (su llave foránea sólo pide un
 * candado compartido de la llave): por eso, sin el candado, el comando alcanza a cotizar sobre
 * lo que veía y se forma recién en el `update` de los totales, que es donde se pisa.
 */
const retenerLaCuenta = (ordenId: string) => (tx: Parameters<Parameters<typeof enCarrera>[0]>[0]) =>
  tx
    .selectFrom('ordenes')
    .select('id')
    .where('id', '=', ordenId)
    .forNoKeyUpdate()
    .executeTakeFirstOrThrow();

async function cuenta(ordenId: string) {
  const db = obtenerDb();
  const orden = await db
    .selectFrom('ordenes')
    .select(['total_centavos', 'estado'])
    .where('id', '=', ordenId)
    .executeTakeFirstOrThrow();
  const lineas = await db
    .selectFrom('orden_lineas')
    .select(['id', 'producto_nombre', 'total_centavos', 'anulada_en'])
    .where('orden_id', '=', ordenId)
    .execute();
  const vivas = lineas.filter((l) => l.anulada_en === null);
  return {
    orden,
    vivas,
    sumaDeLasVivas: vivas.reduce((suma, l) => suma + l.total_centavos, 0n),
  };
}

describe('dos comandos simultáneos sobre la misma cuenta', () => {
  it('dos pedidos a la vez: la cuenta vale TODO lo que lleva y el segundo no pisa el total del primero', async () => {
    const ordenId = await abrir(0);

    const resultados = await enCarrera<Resultado<unknown>>(retenerLaCuenta(ordenId), [
      () => pedir(ordenId, arrachera, '2'),
      () => pedir(ordenId, cerveza, '3'),
    ]);
    for (const resultado of resultados) exigirOk(resultado, 'restaurante.enviar_pedido');

    const { orden, vivas, sumaDeLasVivas } = await cuenta(ordenId);
    const esperado = 2n * PRECIO_ARRACHERA + 3n * PRECIO_CERVEZA;
    // Las dos líneas están: lo que el mesero mandó nunca se pierde...
    expect(vivas.map((l) => l.producto_nombre).sort()).toEqual([
      'Arrachera al carbón',
      'Cerveza clara',
    ]);
    // ...y el total de la cuenta es lo que suman, no lo que sumaba una de las dos.
    expect(sumaDeLasVivas).toBe(esperado);
    expect(orden.total_centavos).toBe(esperado);
  });

  it('pedir la cuenta mientras entra otro pedido: lo que se cobra es lo que hay, y la cuenta SIGUE pedida', async () => {
    const ordenId = await abrir(1);
    exigirOk(await pedir(ordenId, arrachera, '1'), 'restaurante.enviar_pedido');

    const salidas = await enCarrera<Resultado<unknown>>(retenerLaCuenta(ordenId), [
      () => pedir(ordenId, sopa, '1'),
      () =>
        comando(solicitarCuenta, {
          entrada: { ordenId, propinaTipo: 'sin_propina' },
          ambito: ambito(),
          idempotencyKey: clave(),
        }),
    ]);

    // Con el candado hay dos órdenes posibles y las dos son buenas: la sopa entra antes de que
    // se pida la cuenta, o la cuenta se pide primero y la sopa ya no cabe. La cuenta, en
    // cambio, siempre se pide.
    const [elPedido, laCuenta] = salidas;
    if (elPedido === undefined || laCuenta === undefined) {
      throw new Error('La barrera debía devolver el pedido y la cuenta pedida.');
    }
    exigirOk(laCuenta, 'restaurante.solicitar_cuenta');
    const { orden, vivas, sumaDeLasVivas } = await cuenta(ordenId);
    expect(orden.estado, 'pedir la cuenta no se deshace porque entró un pedido').toBe(
      'cuenta_solicitada',
    );
    expect(orden.total_centavos, 'el total que lee la caja es la suma de lo que hay').toBe(
      sumaDeLasVivas,
    );
    // Y la sopa está en la cuenta sólo si el pedido se aceptó: ni un plato fantasma ni un plato
    // que se cobra sin haberse aceptado.
    expect(vivas.some((l) => l.producto_nombre === 'Sopa de tortilla')).toBe(elPedido.ok);
  });

  it('dos anulaciones a la vez de platillos distintos: queda lo que NO se anuló', async () => {
    const ordenId = await abrir(2);
    for (const [producto, cantidad] of [
      [arrachera, '1'],
      [cerveza, '2'],
      [sopa, '1'],
    ] as const) {
      exigirOk(await pedir(ordenId, producto, cantidad), 'restaurante.enviar_pedido');
    }
    const { vivas: antes } = await cuenta(ordenId);
    const lineaDe = (nombre: string) => antes.find((l) => l.producto_nombre === nombre)?.id ?? '';

    const resultados = await enCarrera<Resultado<unknown>>(retenerLaCuenta(ordenId), [
      () => anular(ordenId, lineaDe('Arrachera al carbón')),
      () => anular(ordenId, lineaDe('Cerveza clara')),
    ]);
    for (const resultado of resultados) exigirOk(resultado, 'restaurante.anular_linea');

    const { orden, vivas } = await cuenta(ordenId);
    expect(vivas.map((l) => l.producto_nombre)).toEqual(['Sopa de tortilla']);
    // La cuenta vale la sopa, no la sopa más lo que la otra anulación no había visto.
    expect(orden.total_centavos).toBe(PRECIO_SOPA);
  });

  it('un descuento y un pedido a la vez: la cuenta vale lo que suman sus líneas, con el descuento', async () => {
    const ordenId = await abrir(3);
    exigirOk(await pedir(ordenId, arrachera, '1'), 'restaurante.enviar_pedido');
    const descuento = 1_000n;

    const resultados = await enCarrera<Resultado<unknown>>(retenerLaCuenta(ordenId), [
      () =>
        comando(descontarCuenta, {
          entrada: {
            ordenId,
            descuentoCentavos: Number(descuento),
            motivo: 'cortesía de la casa',
          },
          ambito: ambitoDeLaGerente(),
          idempotencyKey: clave(),
        }),
      () => pedir(ordenId, cerveza, '2'),
    ]);
    for (const resultado of resultados) exigirOk(resultado, 'la carrera del descuento');

    const { orden, vivas, sumaDeLasVivas } = await cuenta(ordenId);
    const base = PRECIO_ARRACHERA + 2n * PRECIO_CERVEZA;
    // Los dos platos están, y la cuenta vale TODO lo que lleva menos lo que se descontó: ni la
    // cerveza que el descuento no vio, ni el descuento que el pedido no vio.
    expect(vivas).toHaveLength(2);
    expect(sumaDeLasVivas).toBe(base - descuento);
    expect(orden.total_centavos).toBe(base - descuento);
  });
});
