import { describe, expect, it } from 'vitest';

import { contextoFalso, crearBaseFalsa, type Fila } from '../restaurante/pruebas/base-falsa.ts';
import { ambitoDe, ORG, SUCURSAL } from '../restaurante/pruebas/sala.ts';
import { kardexDeInsumo } from './kardex.ts';

/**
 * F-103 · El comando de kardex.
 *
 * ── Qué se prueba aquí y qué en el dominio ─────────────────────────────────
 * El dominio resume; esto DECIDE QUÉ FILAS SE RESUMEN. Las dos mitades fallan
 * distinto: si el resumen se equivoca, el total está mal; si la consulta trae
 * las filas de otro almacén, el total está bien calculado sobre datos que no
 * son. El segundo error es más difícil de ver y por eso tiene su prueba.
 */

const INSUMO = 'a1111111-1111-4111-8111-111111111111';
const ALMACEN = 'b2222222-2222-4222-8222-222222222222';
const OTRO_ALMACEN = 'c3333333-3333-4333-8333-333333333333';
const AHORA = new Date('2026-09-15T18:00:00.000Z');

function renglon(cambios: Partial<Fila> = {}): Fila {
  return {
    organizacion_id: ORG,
    almacen_id: ALMACEN,
    insumo_id: INSUMO,
    movimiento_id: 'm1',
    created_at: new Date('2026-09-10T10:00:00.000Z'),
    tipo: 'entrada',
    motivo: null,
    cantidad: '10.0000',
    unidad: 'pieza',
    costo_unitario_centavos: 1200n,
    importe_centavos: 12_000n,
    referencia_tipo: null,
    referencia_id: null,
    empleado_id: null,
    saldo: '10.0000',
    ...cambios,
  };
}

const baseDe = (filas: readonly Fila[]) => crearBaseFalsa({ kardex: filas });

describe('F-103 · el comando', () => {
  it('sólo trae el almacén pedido: el mismo insumo en dos almacenes son dos saldos', async () => {
    const base = baseDe([
      renglon({ movimiento_id: 'm1', cantidad: '10.0000', saldo: '10.0000' }),
      renglon({
        movimiento_id: 'm2',
        almacen_id: OTRO_ALMACEN,
        cantidad: '99.0000',
        saldo: '99.0000',
      }),
    ]);
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    const salida = await kardexDeInsumo.ejecutar(ctx, {
      insumoId: INSUMO,
      almacenId: ALMACEN,
      limite: 100,
    });

    // Sumarlos daría 109, que es un número que no existe en ningún estante.
    expect(salida.renglones).toHaveLength(1);
    expect(salida.resumen.saldoFinal).toBe('10.0000');
  });

  it('no trae el kardex de otra organización', async () => {
    const base = baseDe([
      renglon({ organizacion_id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', saldo: '77.0000' }),
    ]);
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    const salida = await kardexDeInsumo.ejecutar(ctx, {
      insumoId: INSUMO,
      almacenId: ALMACEN,
      limite: 100,
    });

    expect(salida.renglones).toHaveLength(0);
    expect(salida.resumen.renglones).toBe(0);
  });

  it('avisa cuando hay MÁS historia de la que devolvió', async () => {
    const base = baseDe([
      renglon({ movimiento_id: 'm1', saldo: '10.0000' }),
      renglon({ movimiento_id: 'm2', cantidad: '-1.0000', saldo: '9.0000' }),
      renglon({ movimiento_id: 'm3', cantidad: '-1.0000', saldo: '8.0000' }),
    ]);
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    const salida = await kardexDeInsumo.ejecutar(ctx, {
      insumoId: INSUMO,
      almacenId: ALMACEN,
      limite: 2,
    });

    // Sin este aviso, la pantalla enseñaría «saldo final 9.0000» como si fuera
    // el saldo de hoy, y es el de hace dos movimientos.
    expect(salida.renglones).toHaveLength(2);
    expect(salida.hayMas).toBe(true);
  });

  it('no avisa cuando la historia cabe entera', async () => {
    const base = baseDe([renglon({ movimiento_id: 'm1', saldo: '10.0000' })]);
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    const salida = await kardexDeInsumo.ejecutar(ctx, {
      insumoId: INSUMO,
      almacenId: ALMACEN,
      limite: 10,
    });

    expect(salida.hayMas).toBe(false);
  });

  it('devuelve el resumen ya calculado, para que dos pantallas no lo sumen distinto', async () => {
    const base = baseDe([
      renglon({ movimiento_id: 'm1', cantidad: '10.0000', saldo: '10.0000' }),
      renglon({
        movimiento_id: 'm2',
        cantidad: '-4.0000',
        saldo: '6.0000',
        tipo: 'salida_venta',
        importe_centavos: -4800n,
        motivo: 'venta',
      }),
    ]);
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    const salida = await kardexDeInsumo.ejecutar(ctx, {
      insumoId: INSUMO,
      almacenId: ALMACEN,
      limite: 100,
    });

    expect(salida.resumen.entradas).toBe('10.0000');
    expect(salida.resumen.salidas).toBe('4.0000');
    expect(salida.resumen.saldoFinal).toBe('6.0000');
    expect(salida.resumen.valorFinalCentavos).toBe('7200');
    expect(salida.resumen.conMotivo).toBe(1);
  });

  it('no escribe, no audita y no exige clave de idempotencia', () => {
    // Auditar cada consulta de una ficha llenaría la tabla de auditoría de ruido
    // y escondería lo que sí importa.
    expect(kardexDeInsumo.escribe).toBe(false);
  });

  it('cuelga del módulo de movimientos: un negocio sin inventario no tiene kardex', () => {
    expect(kardexDeInsumo.modulo).toBe('movimientos_inventario');
  });

  it('el cajero no ve el kardex: es un dato de costo', () => {
    expect([...kardexDeInsumo.roles]).not.toContain('cajero');
    expect([...kardexDeInsumo.roles]).not.toContain('mesero');
  });
});

describe('F-103 · el almacén por omisión (C.10 de la 2.4)', () => {
  it('sin almacén, el principal de la sucursal de la sesión: la ficha no tiene por qué saberlo', async () => {
    const base = crearBaseFalsa({
      kardex: [
        renglon({ movimiento_id: 'm1', cantidad: '10.0000', saldo: '10.0000' }),
        renglon({
          movimiento_id: 'm2',
          almacen_id: OTRO_ALMACEN,
          cantidad: '99.0000',
          saldo: '99.0000',
        }),
      ],
      almacenes: [
        {
          id: OTRO_ALMACEN,
          organizacion_id: ORG,
          sucursal_id: SUCURSAL,
          principal: false,
          activo: true,
        },
        { id: ALMACEN, organizacion_id: ORG, sucursal_id: SUCURSAL, principal: true, activo: true },
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    const salida = await kardexDeInsumo.ejecutar(ctx, { insumoId: INSUMO, limite: 100 });

    expect(salida.renglones.map((r) => r.movimientoId)).toEqual(['m1']);
  });
});

describe('F-103 · los más recientes (C.10 de la 2.4)', () => {
  it('con `recientes` trae los ÚLTIMOS, y los devuelve en orden cronológico', async () => {
    const base = crearBaseFalsa({
      kardex: [
        renglon({
          movimiento_id: 'm1',
          created_at: new Date('2026-09-01T10:00:00Z'),
          saldo: '1.0000',
        }),
        renglon({
          movimiento_id: 'm2',
          created_at: new Date('2026-09-02T10:00:00Z'),
          saldo: '2.0000',
        }),
        renglon({
          movimiento_id: 'm3',
          created_at: new Date('2026-09-03T10:00:00Z'),
          saldo: '3.0000',
        }),
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    const salida = await kardexDeInsumo.ejecutar(ctx, {
      insumoId: INSUMO,
      almacenId: ALMACEN,
      limite: 2,
      recientes: true,
    });

    expect(salida.renglones.map((r) => r.movimientoId)).toEqual(['m2', 'm3']);
    expect(salida.hayMas).toBe(true);
    expect(salida.resumen.saldoFinal).toBe('3.0000');
  });
});
