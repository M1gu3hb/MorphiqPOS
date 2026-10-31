import { obtenerDb } from '@morphiqpos/data';
import { describe, expect, it } from 'vitest';

import { exigirOk } from '../pruebas/negocio-real.ts';
import { quitarDelCarrito } from './carrito-comandos.ts';
import { MAXIMO_EN_EL_CARRITO, huellaDelDispositivo } from './carrito.ts';
import {
  PIMIENTA,
  TELEFONO_A,
  TELEFONO_B,
  comandasDe,
  lineasDeLaCuenta,
  mesaConPortal,
} from './pruebas/mesa-con-portal.ts';

/**
 * DP-9.5 · EL CARRITO COMPARTIDO DE LA MESA, contra Postgres real.
 *
 * Dos teléfonos de la misma mesa arman UN carrito: cada quien ve lo de todos y quita sólo lo
 * suyo. Con dos o más, enviar pide «¿Ya pidieron todos?». Sale UNA vez, con el precio del
 * catálogo, una comanda por estación, y se vacía para todos —también si dos lo mandan a la
 * vez—. Lo de una cuenta anterior no aparece en la siguiente.
 */

describe('el carrito compartido de la mesa', () => {
  it('dos teléfonos ven lo de los dos; cada quien quita sólo lo suyo', async () => {
    const caso = await mesaConPortal();
    await caso.abrir(1);
    exigirOk(await caso.agregar(TELEFONO_A, caso.taco, '2', 'sin cebolla'), 'agregar A');
    await caso.mirar(TELEFONO_B);
    exigirOk(await caso.agregar(TELEFONO_B, caso.agua), 'agregar B');

    const desdeA = await caso.mirar(TELEFONO_A);
    const desdeB = await caso.mirar(TELEFONO_B);
    expect(desdeA?.lineas.map((l) => [l.nombre, l.cantidad, l.notas, l.esMia])).toEqual([
      ['Taco de barbacoa', '2', 'sin cebolla', true],
      ['Agua de jamaica', '1', '', false],
    ]);
    expect(desdeB?.lineas.map((l) => l.esMia)).toEqual([false, true]);
    expect(desdeB?.conectados).toBe(2);
    expect(desdeB?.esperarATodos).toBe(true);

    const deA = desdeA?.lineas[0]?.id ?? '';
    const ajena = await caso.publico(quitarDelCarrito, { dispositivo: TELEFONO_B, lineaId: deA });
    expect(ajena.ok ? null : ajena.error.datos?.['regla']).toBe('QR_LINEA_AJENA');
    exigirOk(
      await caso.publico(quitarDelCarrito, { dispositivo: TELEFONO_A, lineaId: deA }),
      'quitar A',
    );
    expect((await caso.mirar(TELEFONO_B))?.lineas.map((l) => l.nombre)).toEqual([
      'Agua de jamaica',
    ]);
  });

  it('con dos o más, enviar pide confirmación; sale UNA vez, con precio del catálogo, una comanda por estación', async () => {
    const caso = await mesaConPortal();
    await caso.abrir(1);
    exigirOk(await caso.agregar(TELEFONO_A, caso.taco, '2'), 'agregar A');
    exigirOk(await caso.agregar(TELEFONO_B, caso.agua), 'agregar B');

    const sinConfirmar = await caso.enviar(TELEFONO_A, false);
    expect(sinConfirmar.ok ? null : sinConfirmar.error.datos?.['regla']).toBe(
      'QR_CARRITO_SIN_CONFIRMAR',
    );
    expect(await lineasDeLaCuenta(caso.mesaId)).toEqual([]);

    const enviado = exigirOk(await caso.enviar(TELEFONO_A, true), 'enviar');
    expect(enviado).toMatchObject({ enviado: true, ronda: 1, pedido: { lineas: 2, comandas: 2 } });
    expect(await lineasDeLaCuenta(caso.mesaId)).toEqual([
      expect.objectContaining({
        producto_nombre: 'Taco de barbacoa',
        precio_unitario_centavos: 3_500n,
        subtotal_centavos: 7_000n,
      }),
      expect.objectContaining({
        producto_nombre: 'Agua de jamaica',
        precio_unitario_centavos: 2_800n,
      }),
    ]);
    expect(await comandasDe(caso.mesaId)).toBe(2);

    const despues = await caso.mirar(TELEFONO_B);
    expect(despues?.lineas).toEqual([]);
    expect(despues?.ronda).toBe(1);
    expect(despues?.ultimoEnvio?.porEsteTelefono).toBe(false);
    expect((await caso.mirar(TELEFONO_A))?.ultimoEnvio?.porEsteTelefono).toBe(true);
  });

  it('dos «Enviar» a la vez son UN pedido: el segundo encuentra el carrito vacío', async () => {
    const caso = await mesaConPortal();
    await caso.abrir(2);
    exigirOk(await caso.agregar(TELEFONO_A, caso.taco), 'agregar A');
    exigirOk(await caso.agregar(TELEFONO_B, caso.agua), 'agregar B');

    const [uno, otro] = await Promise.all([
      caso.enviar(TELEFONO_A, true),
      caso.enviar(TELEFONO_B, true),
    ]);
    const resultados = [exigirOk(uno, 'enviar A'), exigirOk(otro, 'enviar B')];
    expect(resultados.map((r) => r.enviado).sort()).toEqual([false, true]);
    expect(await lineasDeLaCuenta(caso.mesaId)).toHaveLength(2);
    expect(await comandasDe(caso.mesaId)).toBe(2);
  });

  it('una mesa abierta para dos pide confirmación aunque haya un solo teléfono', async () => {
    const caso = await mesaConPortal();
    await caso.abrir(2);
    exigirOk(await caso.agregar(TELEFONO_A, caso.taco), 'agregar A');
    expect((await caso.mirar(TELEFONO_A))?.esperarATodos).toBe(true);
    const r = await caso.enviar(TELEFONO_A, false);
    expect(r.ok ? null : r.error.datos?.['regla']).toBe('QR_CARRITO_SIN_CONFIRMAR');
  });

  it('una mesa de uno, con un solo teléfono, envía sin confirmar', async () => {
    const caso = await mesaConPortal();
    await caso.abrir(1);
    exigirOk(await caso.agregar(TELEFONO_A, caso.taco), 'agregar A');
    const estado = await caso.mirar(TELEFONO_A);
    expect([estado?.conectados, estado?.esperarATodos]).toEqual([1, false]);
    expect(exigirOk(await caso.enviar(TELEFONO_A, false), 'enviar').enviado).toBe(true);
  });

  it('las personas conectadas son las que latieron en el último minuto', async () => {
    const caso = await mesaConPortal();
    await caso.abrir(1);
    const hace2Minutos = new Date(Date.now() - 120_000);
    await caso.mirar(TELEFONO_B, hace2Minutos);
    expect((await caso.mirar(TELEFONO_A))?.conectados).toBe(1);
  });

  it('lo que quedó de una cuenta anterior no aparece ni se envía', async () => {
    const caso = await mesaConPortal();
    await caso.abrir(1);
    const huella = huellaDelDispositivo(PIMIENTA, TELEFONO_A);
    await obtenerDb()
      .insertInto('carrito_mesa_lineas')
      .values({
        organizacion_id: caso.negocio.organizacionId,
        mesa_id: caso.mesaId,
        dispositivo_huella: huella,
        producto_id: caso.taco,
        cantidad: '5',
        created_at: new Date('2020-01-01T00:00:00Z'),
      })
      .execute();
    expect((await caso.mirar(TELEFONO_A))?.lineas).toEqual([]);
    exigirOk(await caso.agregar(TELEFONO_A, caso.agua), 'agregar');
    exigirOk(await caso.enviar(TELEFONO_A, false), 'enviar');
    expect((await lineasDeLaCuenta(caso.mesaId)).map((l) => l.producto_nombre)).toEqual([
      'Agua de jamaica',
    ]);
  });

  it(`el carrito tiene tope: ${String(MAXIMO_EN_EL_CARRITO)} cosas`, async () => {
    const caso = await mesaConPortal();
    await caso.abrir(1);
    const huella = huellaDelDispositivo(PIMIENTA, TELEFONO_A);
    await obtenerDb()
      .insertInto('carrito_mesa_lineas')
      .values(
        Array.from({ length: MAXIMO_EN_EL_CARRITO }, () => ({
          organizacion_id: caso.negocio.organizacionId,
          mesa_id: caso.mesaId,
          dispositivo_huella: huella,
          producto_id: caso.taco,
          cantidad: '1',
        })),
      )
      .execute();
    const r = await caso.agregar(TELEFONO_A, caso.agua);
    expect(r.ok ? null : r.error.datos?.['regla']).toBe('QR_CARRITO_LLENO');
  });

  it('sin pedidos desde el teléfono no hay carrito ni latido', async () => {
    const caso = await mesaConPortal({ pedidos: false });
    expect(await caso.mirar(TELEFONO_A)).toBeNull();
    const r = await caso.agregar(TELEFONO_A, caso.taco);
    expect(r.ok ? null : r.error.datos?.['regla']).toBe('QR_PORTAL_CERRADO');
    const latidos = await obtenerDb()
      .selectFrom('dispositivos_mesa')
      .select('mesa_id')
      .where('mesa_id', '=', caso.mesaId)
      .execute();
    expect(latidos).toEqual([]);
  });
});
