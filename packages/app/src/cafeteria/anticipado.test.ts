import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import {
  contextoFalso,
  crearBaseFalsa,
  type Fila,
  type TablasFalsas,
} from '../restaurante/pruebas/base-falsa.ts';
import { ambitoDe, ORG, SUCURSAL } from '../restaurante/pruebas/sala.ts';
import { encolarPedido, entregarAnticipado, programarPedido } from './anticipado.ts';

/**
 * F-330 · El pedido anticipado.
 *
 * Lo que se prueba es que la PROMESA sea un compromiso y no una intención: que
 * no se acepte sin cobrar, que no se prometa una hora que ya pasó, que no
 * quepan más de tres en el mismo hueco de cinco minutos, y que el retraso se
 * mida contra la hora prometida y no contra la preparación.
 */

const ORDEN = 'd1111111-1111-4111-8111-111111111111';
const OTRA_ORDEN = 'd2222222-2222-4222-8222-222222222222';
const PEDIDO = 'f1111111-1111-4111-8111-111111111111';
const AHORA = new Date('2026-09-16T13:00:00.000Z');
const A_LAS_815 = new Date('2026-09-16T14:15:00.000Z');

function pedido(cambios: Partial<Fila> = {}): Fila {
  return {
    id: PEDIDO,
    organizacion_id: ORG,
    sucursal_id: SUCURSAL,
    orden_id: ORDEN,
    nombre: 'Ana',
    telefono: null,
    hora_prometida: A_LAS_815,
    estado: 'programado',
    encolado_en: null,
    entregado_en: null,
    ...cambios,
  };
}

function baseDe(extra: Partial<TablasFalsas> = {}) {
  return crearBaseFalsa(
    {
      ordenes: [
        { id: ORDEN, organizacion_id: ORG, estado: 'pagada' },
        { id: OTRA_ORDEN, organizacion_id: ORG, estado: 'pagada' },
      ],
      pedidos_anticipados: [],
      ...extra,
    },
    {
      predeterminados: {
        pedidos_anticipados: {
          telefono: null,
          encolado_en: null,
          entregado_en: null,
          empleado_id: null,
        },
      },
    },
  );
}

describe('F-330 · programar', () => {
  it('guarda la hora prometida y dice cuántos van en ese hueco', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await programarPedido.ejecutar(ctx, {
      ordenId: ORDEN,
      nombre: 'Ana',
      horaPrometida: A_LAS_815.toISOString(),
    });

    expect(base.campo('pedidos_anticipados', 'estado')).toBe('programado');
    expect(base.campo('pedidos_anticipados', 'hora_prometida')).toEqual(A_LAS_815);
    expect(salida.enElHueco).toBe(1);
  });

  it('NO acepta un pedido sobre una venta sin cobrar', async () => {
    const base = baseDe({ ordenes: [{ id: ORDEN, organizacion_id: ORG, estado: 'borrador' }] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const fallo = await programarPedido
      .ejecutar(ctx, {
        ordenId: ORDEN,
        nombre: 'Ana',
        horaPrometida: A_LAS_815.toISOString(),
      })
      .catch((e: unknown) => e);

    // Una reserva sin prenda es el no-show, y un no-show de seis cafés en la
    // hora pico es media hora de barra tirada.
    expect(esErrorDominio(fallo)).toBe(true);
    expect(base.filas('pedidos_anticipados')).toHaveLength(0);
  });

  it('rechaza una hora que ya pasó', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const fallo = await programarPedido
      .ejecutar(ctx, {
        ordenId: ORDEN,
        nombre: 'Ana',
        horaPrometida: new Date('2026-09-16T12:00:00.000Z').toISOString(),
      })
      .catch((e: unknown) => e);

    expect(esErrorDominio(fallo)).toBe(true);
  });

  it('no deja meter un cuarto pedido en el mismo hueco de cinco minutos', async () => {
    const base = baseDe({
      pedidos_anticipados: [
        pedido({ id: 'p1', orden_id: 'o1' }),
        pedido({ id: 'p2', orden_id: 'o2', hora_prometida: new Date('2026-09-16T14:16:00.000Z') }),
        pedido({ id: 'p3', orden_id: 'o3', hora_prometida: new Date('2026-09-16T14:19:00.000Z') }),
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const fallo = await programarPedido
      .ejecutar(ctx, {
        ordenId: ORDEN,
        nombre: 'Beto',
        horaPrometida: new Date('2026-09-16T14:17:00.000Z').toISOString(),
      })
      .catch((e: unknown) => e);

    // Aceptar más en el mismo hueco es prometer algo que no se puede cumplir, y
    // una promesa incumplida en este giro cuesta el cliente.
    expect(esErrorDominio(fallo)).toBe(true);
    expect(base.filas('pedidos_anticipados')).toHaveLength(3);
  });

  it('el hueco SIGUIENTE sí admite, aunque el anterior esté lleno', async () => {
    const base = baseDe({
      pedidos_anticipados: [
        pedido({ id: 'p1', orden_id: 'o1' }),
        pedido({ id: 'p2', orden_id: 'o2', hora_prometida: new Date('2026-09-16T14:16:00.000Z') }),
        pedido({ id: 'p3', orden_id: 'o3', hora_prometida: new Date('2026-09-16T14:19:00.000Z') }),
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await programarPedido.ejecutar(ctx, {
      ordenId: ORDEN,
      nombre: 'Beto',
      horaPrometida: new Date('2026-09-16T14:21:00.000Z').toISOString(),
    });

    expect(salida.enElHueco).toBe(1);
  });

  it('un pedido ya entregado no ocupa hueco: la barra ya está libre', async () => {
    const base = baseDe({
      pedidos_anticipados: [
        pedido({ id: 'p1', orden_id: 'o1', estado: 'entregado', entregado_en: AHORA }),
        pedido({ id: 'p2', orden_id: 'o2', estado: 'entregado', entregado_en: AHORA }),
        pedido({ id: 'p3', orden_id: 'o3', estado: 'entregado', entregado_en: AHORA }),
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await programarPedido.ejecutar(ctx, {
      ordenId: ORDEN,
      nombre: 'Beto',
      horaPrometida: A_LAS_815.toISOString(),
    });

    expect(salida.enElHueco).toBe(1);
  });
});

describe('F-330 · encolar y entregar', () => {
  it('encolar escribe el estado Y la hora en la misma escritura', async () => {
    const base = baseDe({ pedidos_anticipados: [pedido()] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    const salida = await encolarPedido.ejecutar(ctx, { pedidoId: PEDIDO });

    // `pedido_anticipado_en_fila_con_hora` lo exige: separarlas dejaría un
    // pedido en fila sin hora de entrada, que es el dato contra el que se mide.
    expect(base.campo('pedidos_anticipados', 'estado')).toBe('en_fila');
    expect(base.campo('pedidos_anticipados', 'encolado_en')).toEqual(AHORA);
    expect(salida.minutosDeAdelanto).toBe(75);
  });

  it('no se encola dos veces', async () => {
    const base = baseDe({
      pedidos_anticipados: [pedido({ estado: 'en_fila', encolado_en: AHORA })],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    const fallo = await encolarPedido.ejecutar(ctx, { pedidoId: PEDIDO }).catch((e: unknown) => e);

    expect(esErrorDominio(fallo)).toBe(true);
  });

  it('entregar mide contra LA PROMESA, no contra la preparación', async () => {
    const base = baseDe({
      pedidos_anticipados: [pedido({ estado: 'en_fila', encolado_en: AHORA })],
    });
    const tarde = new Date('2026-09-16T14:23:00.000Z');
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), tarde);

    const salida = await entregarAnticipado.ejecutar(ctx, { pedidoId: PEDIDO });

    // Ocho minutos tarde. Medir desde que la comanda llegó a barra diría que se
    // cumplió el compromiso, y lo que se prometió fue una hora del reloj.
    expect(salida.minutosContraLaPromesa).toBe(-8);
    expect(salida.aTiempo).toBe(false);
    expect(base.campo('pedidos_anticipados', 'entregado_en')).toEqual(tarde);
  });

  it('entregar a tiempo lo dice', async () => {
    const base = baseDe({
      pedidos_anticipados: [pedido({ estado: 'en_fila', encolado_en: AHORA })],
    });
    const puntual = new Date('2026-09-16T14:13:00.000Z');
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), puntual);

    const salida = await entregarAnticipado.ejecutar(ctx, { pedidoId: PEDIDO });

    expect(salida.aTiempo).toBe(true);
    expect(salida.minutosContraLaPromesa).toBe(2);
  });

  it('no se entrega dos veces', async () => {
    const base = baseDe({
      pedidos_anticipados: [pedido({ estado: 'entregado', entregado_en: AHORA })],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    const fallo = await entregarAnticipado
      .ejecutar(ctx, { pedidoId: PEDIDO })
      .catch((e: unknown) => e);

    expect(esErrorDominio(fallo)).toBe(true);
  });

  it('no se toca un pedido de otra organización', async () => {
    const base = baseDe({
      pedidos_anticipados: [pedido({ organizacion_id: 'ffffffff-ffff-4fff-8fff-ffffffffffff' })],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    const fallo = await encolarPedido.ejecutar(ctx, { pedidoId: PEDIDO }).catch((e: unknown) => e);

    expect(esErrorDominio(fallo)).toBe(true);
  });
});
