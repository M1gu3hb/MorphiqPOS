import { readFileSync } from 'node:fs';

import { obtenerDb } from '@morphiqpos/data';
import { sql } from 'kysely';
import { describe, expect, it } from 'vitest';

import { comando } from '../produccion.ts';
import { clave, exigirOk } from '../pruebas/negocio-real.ts';
import { cambiarMesaComando } from './cambio-de-mesa.ts';
import { liberarMesa } from './mesas.ts';
import {
  abrirLasCajas,
  ambitoDeCaja,
  cobrarExacto,
  mesaPersistida,
  ordenPersistida,
  pedirLaCuenta,
  sentarYPedir,
  type Salon,
} from './pruebas/salon-real.ts';
import { LADO, mesa, posicion, salonEnFila, unir } from './pruebas/union-en-el-plano.ts';

/**
 * DP-9.6 · LO QUE UNA UNIÓN NO DEJA HACER, contra Postgres real (de la revisión del 26-10).
 *
 * Una principal ya cobrada no absorbe cuentas vivas; sólo se acomodan las mesas del grupo; una
 * cuenta no se muda a una mesa oculta, y la que se muda a la principal de una unión libre es la
 * del grupo; liberar con una cuenta sin cobrar dice eso antes de preguntar por el grupo; y dos
 * uniones a la vez con una mesa en común no la dejan en las dos.
 */

/** La 0 y la 1 pegadas en el plano. */
const JUNTAS = [
  { i: 0, x: 100, y: 100 },
  { i: 1, x: 100 + LADO, y: 100 },
] as const;

function regla(salida: { ok: boolean; error?: { datos?: Readonly<Record<string, unknown>> } }) {
  return salida.ok ? null : (salida.error?.datos?.['regla'] ?? null);
}

function cambiarA(salon: Salon, ordenId: string, destino: number) {
  return comando(cambiarMesaComando, {
    entrada: { ordenId, mesaDestinoId: mesa(salon, destino) },
    ambito: ambitoDeCaja(salon),
    idempotencyKey: clave(),
  });
}

describe('DP-9.6 · lo que una unión no deja hacer', () => {
  it('una principal ya cobrada no se une: lo de la otra no cae en una cuenta pagada', async () => {
    const salon = await salonEnFila('Salón de la principal cobrada');
    await abrirLasCajas(salon);
    const a = await sentarYPedir(salon, 0, [{ platillo: 'cerveza', cantidad: '1' }]);
    await pedirLaCuenta(salon, a.ordenId);
    const total = Number((await ordenPersistida(a.ordenId)).total_centavos);
    exigirOk(await cobrarExacto(ambitoDeCaja(salon), a.ordenId, total), 'cobrar la 1');
    expect((await mesaPersistida(a.mesaId)).estado).toBe('limpieza');
    const b = await sentarYPedir(salon, 1, [{ platillo: 'arrachera', cantidad: '1' }]);

    const r = await unir(salon, 0, [1], JUNTAS);
    expect(r.ok ? '' : r.error.mensaje).toMatch(/ya cobró/);
    expect((await ordenPersistida(b.ordenId)).estado, 'La cuenta viva se absorbió.').not.toBe(
      'absorbida',
    );
    expect(Number((await ordenPersistida(a.ordenId)).total_centavos)).toBe(total);
  });

  it('al unir dos mesas con cuenta, lo de cocina de la absorbida pasa a la cuenta del grupo (D-3)', async () => {
    const salon = await salonEnFila('Salón de la cocina del grupo');
    await abrirLasCajas(salon);
    const a = await sentarYPedir(salon, 0, [{ platillo: 'cerveza', cantidad: '1' }]);
    const b = await sentarYPedir(salon, 1, [{ platillo: 'arrachera', cantidad: '1' }]);
    exigirOk(await unir(salon, 0, [1], JUNTAS), 'unir');
    const comandas = await obtenerDb()
      .selectFrom('comandas')
      .select('orden_id')
      .where('mesa_id', '=', b.mesaId)
      .execute();
    expect(comandas.length, 'La absorbida no mandó nada a cocina.').toBeGreaterThan(0);
    expect(
      [...new Set(comandas.map((c) => c.orden_id))],
      '«Marcar entregado» en la principal no alcanzaría lo de la absorbida.',
    ).toEqual([a.ordenId]);
  });

  it('sólo se acomodan las mesas del grupo: una posición ajena se rechaza', async () => {
    const salon = await salonEnFila('Salón de la posición ajena');
    const antes = await posicion(mesa(salon, 3));
    const r = await unir(salon, 0, [1], [...JUNTAS, { i: 3, x: 900, y: 500 }]);
    expect(r.ok, 'Se movió una mesa que no se estaba uniendo.').toBe(false);
    expect(await posicion(mesa(salon, 3))).toEqual(antes);
  });

  it('una cuenta no se muda a una mesa oculta en una unión', async () => {
    const salon = await salonEnFila('Salón de la mudanza a la oculta');
    await abrirLasCajas(salon);
    exigirOk(await unir(salon, 0, [1], JUNTAS), 'unir libres');
    const c = await sentarYPedir(salon, 2, [{ platillo: 'cerveza', cantidad: '1' }]);
    const r = await cambiarA(salon, c.ordenId, 1);
    expect(r.ok ? '' : r.error.mensaje).toMatch(/unida a la/);
    expect((await mesaPersistida(mesa(salon, 1))).orden_activa_id).toBeNull();
  });

  it('la cuenta que se muda a la principal de una unión libre es la del grupo', async () => {
    const salon = await salonEnFila('Salón de la mudanza al grupo');
    await abrirLasCajas(salon);
    const { unionId } = exigirOk(await unir(salon, 0, [1], JUNTAS), 'unir libres');
    const c = await sentarYPedir(salon, 2, [{ platillo: 'cerveza', cantidad: '1' }]);
    exigirOk(await cambiarA(salon, c.ordenId, 0), 'mudarse a la principal');
    const union = await obtenerDb()
      .selectFrom('uniones_mesa')
      .select('orden_id')
      .where('id', '=', unionId)
      .executeTakeFirstOrThrow();
    const orden = await obtenerDb()
      .selectFrom('ordenes')
      .select('union_id')
      .where('id', '=', c.ordenId)
      .executeTakeFirstOrThrow();
    expect([union.orden_id, orden.union_id]).toEqual([c.ordenId, unionId]);
  });

  it('liberar la principal con la cuenta sin cobrar dice eso, antes de preguntar por el grupo', async () => {
    const salon = await salonEnFila('Salón de la cuenta sin cobrar');
    await abrirLasCajas(salon);
    await sentarYPedir(salon, 0, [{ platillo: 'cerveza', cantidad: '1' }]);
    exigirOk(await unir(salon, 0, [1], JUNTAS), 'unir');
    const r = await comando(liberarMesa, {
      entrada: { mesaId: mesa(salon, 0) },
      ambito: ambitoDeCaja(salon),
      idempotencyKey: clave(),
    });
    expect(regla(r)).toBe('MESA_NO_LIBERABLE');
  });

  it('una unión de antes de la 187: su miembro no se libera como principal y el relleno la marca', async () => {
    const salon = await salonEnFila('Salón de antes de la Fase B');
    await abrirLasCajas(salon);
    await sentarYPedir(salon, 0, [{ platillo: 'cerveza', cantidad: '1' }]);
    await sentarYPedir(salon, 1, [{ platillo: 'arrachera', cantidad: '1' }]);
    exigirOk(await unir(salon, 0, [1], JUNTAS), 'unir');
    // Como venía de antes de la migración: la miembro sin su marca.
    const db = obtenerDb();
    await db
      .updateTable('mesas')
      .set({ unida_a_mesa_id: null })
      .where('id', '=', mesa(salon, 1))
      .execute();
    const r = await comando(liberarMesa, {
      entrada: { mesaId: mesa(salon, 1), grupo: 'mantener' },
      ambito: ambitoDeCaja(salon),
      idempotencyKey: clave(),
    });
    expect(regla(r), 'La miembro decidió por el grupo y se liberó sola.').toBe('MESA_NO_LIBERABLE');

    const migracion = readFileSync(
      new URL(
        '../../../data/src/migraciones/sql/187_unir_mesas_desde_el_mapa.sql',
        import.meta.url,
      ),
      'utf8',
    );
    const relleno = migracion.slice(migracion.indexOf('update mesas m'));
    await sql.raw(relleno).execute(db);
    expect((await mesaPersistida(mesa(salon, 1))).unida_a_mesa_id).toBe(mesa(salon, 0));
  });

  it('dos uniones a la vez con una mesa en común: la mesa queda en una sola', async () => {
    const salon = await salonEnFila('Salón de las uniones simultáneas', 3);
    const [primera, segunda] = await Promise.all([
      unir(salon, 0, [1], JUNTAS),
      unir(
        salon,
        1,
        [2],
        [
          { i: 1, x: 500 - LADO, y: 100 },
          { i: 2, x: 500, y: 100 },
        ],
      ),
    ]);
    expect(
      [primera.ok, segunda.ok].filter(Boolean),
      'La mesa del medio quedó en dos uniones: absorbida en una y principal de la otra.',
    ).toHaveLength(1);
  });
});
