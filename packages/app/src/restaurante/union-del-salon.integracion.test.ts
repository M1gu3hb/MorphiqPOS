import { obtenerDb } from '@morphiqpos/data';
import { describe, expect, it } from 'vitest';

import { comando } from '../produccion.ts';
import { clave, exigirOk } from '../pruebas/negocio-real.ts';
import { buscadorDeProduccion, resolverAmbitoPortal } from '../portal/ambito.ts';
import { abrirMesa } from './mesas.ts';
import { abrirLasCajas, ambitoDeCaja, mesaPersistida, sentarYPedir } from './pruebas/salon-real.ts';
import { LADO, mesa, posicion, salonEnFila, unir } from './pruebas/union-en-el-plano.ts';
import { separarMesasComando } from './union-de-mesas.ts';

/**
 * DP-9.6 · UNIR MESAS DESDE EL MAPA, contra Postgres real.
 *
 * La unión es del SALÓN: nace sin cuenta si las mesas están libres, toma la cuenta que se abra
 * en la principal, oculta a las absorbidas (su QR cae en la principal) y separar regresa cada
 * mesa a donde estaba. Sólo se unen mesas que quedaron pegadas, de la misma zona y dentro del
 * perímetro; sin el tope de seis.
 */

describe('unir mesas desde el mapa', () => {
  it('dos mesas libres pegadas en el mapa se unen sin cuenta; la absorbida se oculta', async () => {
    const salon = await salonEnFila('Salón de mesas libres');
    const r = exigirOk(
      await unir(
        salon,
        0,
        [1],
        [
          { i: 0, x: 100, y: 100 },
          { i: 1, x: 100 + LADO, y: 100 },
        ],
      ),
      'unir',
    );
    expect(r.ordenPrincipalId).toBeNull();
    expect((await mesaPersistida(mesa(salon, 1))).unida_a_mesa_id).toBe(mesa(salon, 0));
    expect(await posicion(mesa(salon, 1))).toEqual([100 + LADO, 100]);
  });

  it('la cuenta que se abre después en la principal es la del grupo; la absorbida no se abre', async () => {
    const salon = await salonEnFila('Salón que abre después');
    await abrirLasCajas(salon);
    const { unionId } = exigirOk(
      await unir(
        salon,
        0,
        [1],
        [
          { i: 0, x: 100, y: 100 },
          { i: 1, x: 100 + LADO, y: 100 },
        ],
      ),
      'unir',
    );
    const { ordenId } = exigirOk(
      await comando(abrirMesa, {
        entrada: { mesaId: mesa(salon, 0), personas: 6 },
        ambito: ambitoDeCaja(salon),
        idempotencyKey: clave(),
      }),
      'abrir la principal',
    );
    const union = await obtenerDb()
      .selectFrom('uniones_mesa')
      .select('orden_id')
      .where('id', '=', unionId)
      .executeTakeFirstOrThrow();
    const orden = await obtenerDb()
      .selectFrom('ordenes')
      .select('union_id')
      .where('id', '=', ordenId)
      .executeTakeFirstOrThrow();
    expect([union.orden_id, orden.union_id]).toEqual([ordenId, unionId]);

    const absorbida = await comando(abrirMesa, {
      entrada: { mesaId: mesa(salon, 1), personas: 2 },
      ambito: ambitoDeCaja(salon),
      idempotencyKey: clave(),
    });
    expect(absorbida.ok ? '' : absorbida.error.mensaje).toMatch(/unida a la 1: abre la 1/);
  });

  it('separar regresa cada mesa a donde estaba y la vuelve a enseñar', async () => {
    const salon = await salonEnFila('Salón que se separa');
    const { unionId } = exigirOk(
      await unir(
        salon,
        1,
        [2],
        [
          { i: 1, x: 400, y: 300 },
          { i: 2, x: 400 + LADO, y: 300 },
        ],
      ),
      'unir',
    );
    exigirOk(
      await comando(separarMesasComando, {
        entrada: { unionId },
        ambito: ambitoDeCaja(salon),
        idempotencyKey: clave(),
      }),
      'separar',
    );
    expect(await posicion(mesa(salon, 1))).toEqual([300, 100]);
    expect(await posicion(mesa(salon, 2))).toEqual([500, 100]);
    expect((await mesaPersistida(mesa(salon, 2))).unida_a_mesa_id).toBeNull();
  });

  it('sólo mesas pegadas: lejos, de otra zona o medio salón, no', async () => {
    const salon = await salonEnFila('Salón de reglas', 9);
    const lejos = await unir(salon, 0, [1]);
    expect(lejos.ok ? null : lejos.error.datos?.['regla']).toBe('UNION_DE_MESAS_INVALIDA');

    const zona = await obtenerDb()
      .insertInto('zonas')
      .values({ organizacion_id: salon.negocio.organizacionId, nombre: 'Terraza' })
      .returning('id')
      .executeTakeFirstOrThrow();
    await obtenerDb()
      .updateTable('mesas')
      .set({ zona_id: zona.id })
      .where('id', '=', mesa(salon, 2))
      .execute();
    const otraZona = await unir(
      salon,
      0,
      [2],
      [
        { i: 0, x: 100, y: 100 },
        { i: 2, x: 100 + LADO, y: 100 },
      ],
    );
    expect(otraZona.ok ? '' : otraZona.error.mensaje).toMatch(/misma zona/);

    // Ocho en hilera, con 5 puntos entre una y otra (se tocan): 675 de largo, más que el perímetro.
    const hilera = [0, 1, 3, 4, 5, 6, 7, 8].map((i, k) => ({ i, x: 100 + k * (LADO + 5), y: 400 }));
    const demasiadas = await unir(salon, 0, [1, 3, 4, 5, 6, 7, 8], hilera);
    expect(demasiadas.ok ? '' : demasiadas.error.mensaje).toMatch(/demasiado/);
  });

  it('sin el tope de seis: siete mesas en un bloque pegado se unen', async () => {
    const salon = await salonEnFila('Salón de siete', 7);
    const bloque = Array.from({ length: 7 }, (_, i) => ({
      i,
      x: 100 + (i % 4) * LADO,
      y: 100 + Math.floor(i / 4) * LADO,
    }));
    const r = exigirOk(await unir(salon, 0, [1, 2, 3, 4, 5, 6], bloque), 'unir siete');
    expect(r.mesasUnidas).toBe(6);
  });

  it('la principal elegida sin cuenta toma la cuenta de la otra; lo de cocina pasa al grupo (D-3)', async () => {
    const salon = await salonEnFila('Salón que muda la cuenta');
    await abrirLasCajas(salon);
    const b = await sentarYPedir(salon, 1, [{ platillo: 'arrachera', cantidad: '1' }]);
    const r = exigirOk(
      await unir(
        salon,
        0,
        [1],
        [
          { i: 0, x: 100, y: 100 },
          { i: 1, x: 100 + LADO, y: 100 },
        ],
      ),
      'unir',
    );
    expect(r.ordenPrincipalId).toBe(b.ordenId);
    expect((await mesaPersistida(mesa(salon, 0))).orden_activa_id).toBe(b.ordenId);
    const comandas = await obtenerDb()
      .selectFrom('comandas')
      .select('orden_id')
      .where('orden_id', '=', b.ordenId)
      .execute();
    expect(comandas.length).toBeGreaterThan(0);
  });

  it('el QR de la mesa absorbida cae en la principal', async () => {
    const salon = await salonEnFila('Salón del QR unido');
    exigirOk(
      await unir(
        salon,
        0,
        [1],
        [
          { i: 0, x: 100, y: 100 },
          { i: 1, x: 100 + LADO, y: 100 },
        ],
      ),
      'unir',
    );
    const qrToken = 'qr-de-la-mesa-absorbida-0123456789';
    await obtenerDb()
      .updateTable('mesas')
      .set({ qr_token: qrToken, qr_activa: true })
      .where('id', '=', mesa(salon, 1))
      .execute();
    const org = salon.negocio.organizacionId;
    const ambito = await resolverAmbitoPortal(buscadorDeProduccion(org), org, qrToken);
    expect([ambito.mesaId, ambito.mesaNumero]).toEqual([mesa(salon, 0), 1]);
  });
});
