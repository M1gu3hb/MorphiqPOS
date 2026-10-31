import { obtenerDb } from '@morphiqpos/data';
import { beforeAll, describe, expect, it } from 'vitest';

import { comando } from '../produccion.ts';
import { ambitoDe, clave, exigirOk } from '../pruebas/negocio-real.ts';
import { transicionarPedido } from '../restaurante/preparacion.ts';
import { pantallaDelTelefono } from './consulta.ts';
import { conectarTelefonoDeCocina } from './conectar.ts';
import { cocinaDePrueba, PIMIENTA, type CocinaDePrueba } from './pruebas.ts';
import { firmarTokenDeEstacion } from './token-de-estacion.ts';
import { transicionarDesdeElTelefono } from './transicion.ts';

/**
 * DP-9.4 · EL TELÉFONO DE UNA ESTACIÓN, contra Postgres real.
 *
 * Lee sólo SU estación, la comanda pendiente más reciente, sin precios; prepara y deja lista con
 * la misma regla que la pantalla de Cocina; si la pantalla grande ya la movió, no se pisan; no
 * toca comandas de otra estación; y cada toque es idempotente y queda auditado sin identidad.
 */

let cocina: CocinaDePrueba;
let token = '';

beforeAll(async () => {
  cocina = await cocinaDePrueba('Fonda del teléfono');
  const conectado = exigirOk(
    await comando(conectarTelefonoDeCocina, {
      entrada: { estacionId: cocina.estacionCocina },
      ambito: { ...ambitoDe(cocina.negocio, cocina.sucursalId, null), rol: 'gerente' },
      idempotencyKey: clave(),
    }),
    'restaurante.conectar_telefono_de_cocina',
  );
  token = firmarTokenDeEstacion(
    {
      organizacionId: conectado.organizacionId,
      estacionId: conectado.estacionId,
      dia: conectado.dia,
      version: conectado.version,
    },
    PIMIENTA,
  );
});

const leer = () =>
  pantallaDelTelefono({ token, organizacionId: cocina.negocio.organizacionId, pimienta: PIMIENTA });

const tocar = (comandaId: string, estado: 'en_preparacion' | 'listo', idempotencyKey = clave()) =>
  transicionarDesdeElTelefono({
    token,
    organizacionId: cocina.negocio.organizacionId,
    pimienta: PIMIENTA,
    entrada: { comandaId, estado },
    idempotencyKey,
    correlationId: crypto.randomUUID(),
  });

describe('lo que lee el teléfono', () => {
  it('sin comandas: la estación y nada pendiente', async () => {
    const pantalla = await leer();
    expect(pantalla.estacion.nombre).toBe('Cocina');
    expect(pantalla.comanda).toBeNull();
    expect(pantalla.pendientes).toBe(0);
  });

  it('enseña la comanda MÁS RECIENTE de su estación y no la de Bebidas, sin precios', async () => {
    await cocina.pedir(1, [{ producto: 'taco', cantidad: '2' }]);
    await cocina.pedir(2, [
      { producto: 'taco', cantidad: '1' },
      { producto: 'agua', cantidad: '1' },
    ]);
    const pantalla = await leer();
    expect(pantalla.pendientes).toBe(2);
    expect(pantalla.comanda?.mesaNumero).toBe(2);
    expect(pantalla.comanda?.platillos).toEqual([
      { nombre: 'Taco de barbacoa', cantidad: '1.0000', notas: null },
    ]);
    const crudo = JSON.stringify(pantalla);
    expect(crudo, 'El teléfono recibe importes.').not.toMatch(/precio|total|costo|centavos/i);
    expect(crudo).not.toContain(cocina.negocio.organizacionId);
  });
});

describe('preparar y listo', () => {
  it('prepara y deja lista la más reciente; aparece la siguiente; queda auditado', async () => {
    const antes = await leer();
    const id = antes.comanda?.id ?? '';
    expect((await tocar(id, 'en_preparacion')).ok).toBe(true);
    expect((await leer()).comanda).toMatchObject({ id, estado: 'en_preparacion' });

    const listo = await tocar(id, 'listo');
    expect(listo.ok, JSON.stringify(listo)).toBe(true);
    const despues = await leer();
    expect(despues.comanda?.mesaNumero, 'No pasó a la siguiente pendiente.').toBe(1);
    expect(despues.pendientes).toBe(1);

    const rastro = await obtenerDb()
      .selectFrom('auditoria')
      .select(['identidad_id', 'accion'])
      .where('organizacion_id', '=', cocina.negocio.organizacionId)
      .where('entidad_id', '=', id)
      .where('accion', '=', 'cocina.telefono_transicionar')
      .execute();
    expect(rastro).toHaveLength(2);
    expect(rastro.every((r) => r.identidad_id === null)).toBe(true);
  });

  it('el mismo toque dos veces es UNO: misma respuesta, sin moverla otra vez', async () => {
    const id = (await leer()).comanda?.id ?? '';
    const llave = clave();
    const primero = await tocar(id, 'en_preparacion', llave);
    const segundo = await tocar(id, 'en_preparacion', llave);
    expect(primero.ok && segundo.ok).toBe(true);
    if (!segundo.ok) return;
    expect(segundo.reintento).toBe(true);
  });

  it('si la pantalla grande ya la dejó lista, «Listo» del teléfono no la pisa', async () => {
    const id = (await leer()).comanda?.id ?? '';
    exigirOk(
      await comando(transicionarPedido, {
        entrada: { comandaId: id, estado: 'listo' },
        ambito: { ...ambitoDe(cocina.negocio, cocina.sucursalId, null), rol: 'cocina' },
        idempotencyKey: clave(),
      }),
      'restaurante.transicionar_pedido',
    );
    const r = await tocar(id, 'listo');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.datos).toMatchObject({ estado: 'listo', sinCambio: true });
    expect((await tocar(id, 'en_preparacion')).ok, 'Devolvió al fuego un plato listo.').toBe(false);
  });

  it('una comanda de otra estación no se toca, ni sabiendo su id', async () => {
    const bebidas = await obtenerDb()
      .selectFrom('comandas')
      .select('id')
      .where('organizacion_id', '=', cocina.negocio.organizacionId)
      .where('estacion_preparacion_id', '=', cocina.estacionBebidas)
      .executeTakeFirstOrThrow();
    const r = await tocar(bebidas.id, 'listo');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.datos?.['regla']).toBe('COMANDA_NO_ENCONTRADA');
  });
});
