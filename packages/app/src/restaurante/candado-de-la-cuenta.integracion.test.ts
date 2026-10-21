import type { Resultado } from '@morphiqpos/contracts';
import { conTransaccion, obtenerDb } from '@morphiqpos/data';
import { sql } from 'kysely';
import { beforeAll, describe, expect, it } from 'vitest';

import { comando } from '../produccion.ts';
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
import { dividirCuentaComando } from './division.ts';
import { abrirMesa } from './mesas.ts';
import { enviarPedido } from './pedido.ts';

/**
 * CADA COMANDO QUE RECALCULA LA CUENTA LA TOMA AL CARGARLA, contra Postgres (día completo del
 * restaurante, 2.4).
 *
 * `pedido-simultaneo.integracion.test.ts` prueba el RESULTADO de dos comandos que se cruzan: la
 * cuenta vale lo que suman sus líneas. Para `dividir_cuenta` esa prueba no sirve: sin candado, el
 * orden en que Postgres despierta a quien espera hace que casi siempre gane la división y el pedido
 * llegue a una cuenta ya repartida —un resultado consistente por casualidad—, y la mutación que
 * quita el candado sobrevivía. Aquí se mira la CAUSA y no el resultado: se retiene la fila de la
 * cuenta desde la prueba, se lanza el comando y se pregunta a Postgres qué sentencia está
 * esperando. Con el candado, la primera lectura de la cuenta —la que carga `for update`— es la que
 * espera; sin él, el comando lee, escribe líneas y se atora más adelante, en otra sentencia.
 *
 * Y al soltar la fila el comando termina bien: el candado hace esperar, no fallar.
 */

let negocio: NegocioReal;
let sucursal: SucursalReal;
let arrachera = '';
let mesas: readonly string[] = [];

const ambito = () => ambitoDe(negocio, sucursal.sucursalId, null);
/** Descontar, dividir y anular son de caja o de dirección: el mesero no puede. */
const ambitoDeLaGerente = () => ({ ...ambito(), rol: 'gerente' as const });

beforeAll(async () => {
  negocio = await sembrarNegocio({
    nombre: 'Restaurante del candado',
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
  await db
    .insertInto('topes_descuento')
    .values({
      organizacion_id: negocio.organizacionId,
      rol: 'gerente',
      tope_centavos: 200_000n,
      tope_bp: 3_000,
    })
    .execute();
  arrachera = (
    await db
      .insertInto('productos')
      .values({
        organizacion_id: negocio.organizacionId,
        nombre: 'Arrachera al carbón',
        precio_venta_centavos: 32_900n,
        costo_unitario_centavos: 16_450n,
        estrategia_consumo: 'ninguno',
        area_preparacion: 'cocina',
      })
      .returning('id')
      .executeTakeFirstOrThrow()
  ).id;
  // Una mesa por caso.
  mesas = (
    await db
      .insertInto('mesas')
      .values(
        [1, 2, 3, 4, 5].map((numero) => ({
          organizacion_id: negocio.organizacionId,
          sucursal_id: sucursal.sucursalId,
          numero,
        })),
      )
      .returning('id')
      .execute()
  ).map((m) => m.id);
});

/** Una cuenta abierta con dos arracheras: lo que hace falta para anular, descontar y dividir. */
async function cuentaConDosArracheras(indiceDeMesa: number) {
  const abierta = await comando(abrirMesa, {
    entrada: { mesaId: mesas[indiceDeMesa] ?? '', personas: 2 },
    ambito: ambito(),
    idempotencyKey: clave(),
  });
  const { ordenId } = exigirOk(abierta, 'restaurante.abrir_mesa');
  exigirOk(
    await comando(enviarPedido, {
      entrada: { ordenId, lineas: [{ productoId: arrachera, cantidad: '2' }] },
      ambito: ambito(),
      idempotencyKey: clave(),
    }),
    'restaurante.enviar_pedido',
  );
  const lineas = await obtenerDb()
    .selectFrom('orden_lineas')
    .select('id')
    .where('orden_id', '=', ordenId)
    .execute();
  return { ordenId, lineaId: lineas[0]?.id ?? '' };
}

/** Lo que Postgres dice que está esperando un candado ahora mismo, o `null` si no hay nadie. */
async function sentenciaEnEspera(): Promise<string | null> {
  const { rows } = await sql<{ query: string }>`
    select query
      from pg_stat_activity
     where datname = current_database()
       and wait_event_type = 'Lock'
     limit 1
  `.execute(obtenerDb());
  return rows[0]?.query ?? null;
}

/**
 * Retiene la cuenta, lanza el comando y devuelve la sentencia que quedó esperando junto con lo
 * que el comando contestó al soltarla.
 */
async function loQueEsperaAlComando<T>(
  ordenId: string,
  lanzar: () => Promise<Resultado<T>>,
): Promise<{ readonly sentencia: string; readonly resultado: Resultado<T> }> {
  let sentencia = '';
  let corriendo: Promise<Resultado<T>> | undefined;
  await conTransaccion(async (tx) => {
    // La retención NO es el candado que se prueba: `for no key update` no deja pasar a un
    // `for update` ni a un `update`, y sí deja pasar a la llave foránea de un `insert`.
    await tx
      .selectFrom('ordenes')
      .select('id')
      .where('id', '=', ordenId)
      .forNoKeyUpdate()
      .executeTakeFirstOrThrow();
    corriendo = lanzar();
    const limite = Date.now() + 10_000;
    for (;;) {
      const esperando = await sentenciaEnEspera();
      if (esperando !== null) {
        sentencia = esperando;
        return;
      }
      if (Date.now() > limite) {
        throw new Error('El comando no se detuvo en ningún candado: no toma la cuenta.');
      }
      await new Promise((listo) => setTimeout(listo, 10));
    }
  });
  if (corriendo === undefined) throw new Error('El comando no llegó a lanzarse.');
  return { sentencia, resultado: await corriendo };
}

/** La primera lectura de la cuenta —y no una escritura que llega después— es la que espera. */
const CARGA_LA_CUENTA_CON_CANDADO = /select .*from "ordenes".* for update/s;

describe('cada comando que recalcula la cuenta la toma al cargarla', () => {
  it('enviar_pedido: un pedido a una cuenta retenida espera en su primera lectura', async () => {
    const { ordenId } = await cuentaConDosArracheras(0);
    const { sentencia, resultado } = await loQueEsperaAlComando(ordenId, () =>
      comando(enviarPedido, {
        entrada: { ordenId, lineas: [{ productoId: arrachera, cantidad: '1' }] },
        ambito: ambito(),
        idempotencyKey: clave(),
      }),
    );
    expect(sentencia).toMatch(CARGA_LA_CUENTA_CON_CANDADO);
    exigirOk(resultado, 'restaurante.enviar_pedido');
  });

  it('solicitar_cuenta: pedir la cuenta espera en su primera lectura', async () => {
    const { ordenId } = await cuentaConDosArracheras(1);
    const { sentencia, resultado } = await loQueEsperaAlComando(ordenId, () =>
      comando(solicitarCuenta, {
        entrada: { ordenId, propinaTipo: 'sin_propina' },
        ambito: ambito(),
        idempotencyKey: clave(),
      }),
    );
    expect(sentencia).toMatch(CARGA_LA_CUENTA_CON_CANDADO);
    exigirOk(resultado, 'restaurante.solicitar_cuenta');
  });

  it('anular_linea: anular un platillo espera en su primera lectura', async () => {
    const { ordenId, lineaId } = await cuentaConDosArracheras(2);
    const { sentencia, resultado } = await loQueEsperaAlComando(ordenId, () =>
      comando(anularLineaComando, {
        entrada: { ordenId, lineaId, motivo: 'error_mesero' },
        ambito: ambitoDeLaGerente(),
        idempotencyKey: clave(),
      }),
    );
    expect(sentencia).toMatch(CARGA_LA_CUENTA_CON_CANDADO);
    exigirOk(resultado, 'restaurante.anular_linea');
  });

  it('descontar_cuenta: el descuento espera en su primera lectura', async () => {
    const { ordenId } = await cuentaConDosArracheras(3);
    const { sentencia, resultado } = await loQueEsperaAlComando(ordenId, () =>
      comando(descontarCuenta, {
        entrada: { ordenId, descuentoCentavos: 1_000, motivo: 'cortesía de la casa' },
        ambito: ambitoDeLaGerente(),
        idempotencyKey: clave(),
      }),
    );
    expect(sentencia).toMatch(CARGA_LA_CUENTA_CON_CANDADO);
    exigirOk(resultado, 'restaurante.descontar_cuenta');
  });

  it('dividir_cuenta: dividir espera en su primera lectura, antes de repartir nada', async () => {
    const { ordenId, lineaId } = await cuentaConDosArracheras(4);
    const { sentencia, resultado } = await loQueEsperaAlComando(ordenId, () =>
      comando(dividirCuentaComando, {
        entrada: {
          ordenId,
          particiones: [
            { tomas: [{ lineaId, cantidad: 1 }] },
            { tomas: [{ lineaId, cantidad: 1 }] },
          ],
        },
        ambito: ambitoDeLaGerente(),
        idempotencyKey: clave(),
      }),
    );
    expect(sentencia).toMatch(CARGA_LA_CUENTA_CON_CANDADO);
    exigirOk(resultado, 'restaurante.dividir_cuenta');
  });
});
