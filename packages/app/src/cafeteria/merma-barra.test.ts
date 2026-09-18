import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import {
  contextoFalso,
  crearBaseFalsa,
  type TablasFalsas,
} from '../restaurante/pruebas/base-falsa.ts';
import { ambitoDe, ORG, PRODUCTO, SUCURSAL, TERMINAL } from '../restaurante/pruebas/sala.ts';
import { porShots, registrarCalibracion, registrarMermaBarra } from './merma-barra.ts';

/**
 * F-156 · La merma de barra.
 *
 * $700 al mes de calibración más el 5–15 % de la leche, invisibles. El
 * inventario de café NUNCA cuadra y la dueña concluye que «las recetas no
 * sirven» — y deja de confiar en el único número que tenía.
 *
 * Lo que estas pruebas vigilan: que la merma salga del ledger que ya existe
 * —no de una tabla paralela—, que el costo se congele, y que la calibración
 * ponga los gramos desde el servidor y no desde el barista con la fila
 * empezando.
 */

const ALMACEN = 'a1111111-1111-4111-8111-111111111111';
const GRANO = 'b1111111-1111-4111-8111-11111111111a';
const SESION = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const AHORA = new Date('2026-09-15T07:05:00.000Z');

function barra(extra: Partial<TablasFalsas> = {}): TablasFalsas {
  return {
    almacenes: [
      { id: ALMACEN, organizacion_id: ORG, sucursal_id: SUCURSAL, nombre: 'Barra', activo: true },
    ],
    insumos: [
      {
        id: GRANO,
        organizacion_id: ORG,
        nombre: 'Café de especialidad',
        unidad_base: 'g',
        // $0.90 el gramo.
        costo_unitario_centavos: 90n,
      },
    ],
    existencias: [
      { organizacion_id: ORG, almacen_id: ALMACEN, insumo_id: GRANO, cantidad: '1000.0000' },
    ],
    productos: [
      {
        id: PRODUCTO,
        organizacion_id: ORG,
        nombre: 'Espresso',
        insumo_base_id: GRANO,
        gramaje_shot: '18.0000',
      },
    ],
    lotes_grano: [
      {
        id: 'lote-1',
        organizacion_id: ORG,
        sucursal_id: SUCURSAL,
        insumo_id: GRANO,
        fecha_tueste: '2026-09-01',
        abierto_en: new Date('2026-09-10T07:00:00.000Z'),
        agotado_en: null,
      },
    ],
    sesiones_caja: [
      {
        id: SESION,
        organizacion_id: ORG,
        sucursal_id: SUCURSAL,
        terminal_id: TERMINAL,
        estado: 'abierta',
      },
    ],
    movimientos_stock: [],
    ...extra,
  };
}

const baseDe = (extra: Partial<TablasFalsas> = {}) => crearBaseFalsa(barra(extra));

async function codigoDe(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return 'NO LANZÓ';
  } catch (error) {
    return esErrorDominio(error) ? error.codigo : `INESPERADO: ${String(error)}`;
  }
}

describe('F-156 · registrar lo que se va en la barra', () => {
  it('SALE DEL LEDGER QUE YA EXISTE, con su motivo tipado', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    await registrarMermaBarra.ejecutar(ctx, {
      motivo: 'derrame',
      insumoId: GRANO,
      cantidad: '20.0000',
    });

    const movimiento = base.filas('movimientos_stock')[0];
    expect(movimiento?.['tipo']).toBe('merma');
    expect(movimiento?.['referencia_tipo']).toBe('merma_barra');
    expect(movimiento?.['motivo']).toBe('derrame');
    // NEGATIVA: el ledger guarda las salidas con signo, igual que la caja.
    expect(movimiento?.['cantidad']).toBe('-20.0000');
  });

  it('DESCUENTA DE LA EXISTENCIA, que es el punto entero', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    await registrarMermaBarra.ejecutar(ctx, {
      motivo: 'vapor_leche',
      insumoId: GRANO,
      cantidad: '20.0000',
    });

    expect(base.campo('existencias', 'cantidad')).toBe('980.0000');
  });

  it('EL COSTO SE CONGELA: la merma de hoy no se valora con el café de mañana', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await registrarMermaBarra.ejecutar(ctx, {
      motivo: 'derrame',
      insumoId: GRANO,
      cantidad: '20.0000',
    });

    // 20 g a $0.90 = $18.00.
    expect(salida.costoCentavos).toBe('1800');
    expect(base.campo('movimientos_stock', 'costo_unitario_centavos')).toBe(90n);
  });

  it('QUEDA ATADA AL TURNO: el corte dice «esta mañana se fueron 180 g»', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    await registrarMermaBarra.ejecutar(ctx, {
      motivo: 'calibracion',
      insumoId: GRANO,
      cantidad: '72.0000',
    });

    expect(base.campo('movimientos_stock', 'sesion_caja_id')).toBe(SESION);
  });

  it('UNA MERMA PUEDE DEJAR LA EXISTENCIA EN NEGATIVO, y debe', async () => {
    // El café salió del bote. Negarlo porque el sistema creía que había menos
    // sería mentir sobre un hecho físico, y ese negativo es exactamente la
    // señal de que el conteo está mal.
    const base = baseDe({
      existencias: [
        { organizacion_id: ORG, almacen_id: ALMACEN, insumo_id: GRANO, cantidad: '10.0000' },
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    await registrarMermaBarra.ejecutar(ctx, {
      motivo: 'derrame',
      insumoId: GRANO,
      cantidad: '20.0000',
    });

    expect(base.campo('existencias', 'cantidad')).toBe('-10.0000');
  });

  it('un insumo sin existencia en este almacén', async () => {
    const base = baseDe({ existencias: [] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    expect(
      await codigoDe(() =>
        registrarMermaBarra.ejecutar(ctx, {
          motivo: 'derrame',
          insumoId: GRANO,
          cantidad: '1.0000',
        }),
      ),
    ).toBe('INVENTARIO_INVALIDO');
  });

  it('un motivo que no es de barra no entra', () => {
    expect(
      registrarMermaBarra.entrada.safeParse({
        motivo: 'se_lo_llevo_el_viento',
        insumoId: GRANO,
        cantidad: '1',
      }).success,
    ).toBe(false);
  });

  it('LA CANTIDAD ES TEXTO: 0.1 + 0.2 no es 0.3', () => {
    expect(
      registrarMermaBarra.entrada.safeParse({ motivo: 'derrame', insumoId: GRANO, cantidad: 1 })
        .success,
    ).toBe(false);
  });
});

describe('F-156 · el atajo de la calibración', () => {
  it('LOS GRAMOS LOS PONE EL SERVIDOR: el barista sólo dice cuántos shots', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await registrarCalibracion.ejecutar(ctx, { shots: 4 });

    // 4 × 18 g = 72 g, a $0.90 = $64.80.
    expect(salida.cantidad).toBe('72.0000');
    expect(salida.costoCentavos).toBe('6480');
    expect(salida.motivo).toBe('calibracion');
  });

  it('EL CLIENTE NO MANDA LOS GRAMOS: la entrada no los acepta', () => {
    const analisis = registrarCalibracion.entrada.safeParse({ shots: 4, cantidad: '1.0000' });
    expect(analisis.success).toBe(true);
    expect(analisis.success ? Object.keys(analisis.data).sort() : []).toEqual(['shots']);
  });

  it('usa el grano del LOTE ABIERTO, que es lo que está en la tolva', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await registrarCalibracion.ejecutar(ctx, { shots: 1 });

    expect(salida.insumoId).toBe(GRANO);
  });

  it('SIN LOTE ABIERTO FALLA en vez de adivinar el café', async () => {
    // Una merma cargada al grano equivocado ensucia dos inventarios en vez de
    // uno, y ninguno de los dos vuelve a cuadrar.
    const base = baseDe({ lotes_grano: [] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    expect(await codigoDe(() => registrarCalibracion.ejecutar(ctx, { shots: 4 }))).toBe(
      'INVENTARIO_INVALIDO',
    );
    expect(base.filas('movimientos_stock')).toEqual([]);
  });

  it('SIN GRAMAJE DECLARADO falla en vez de inventar «los 18 de siempre»', async () => {
    const base = baseDe({
      productos: [
        { id: PRODUCTO, organizacion_id: ORG, insumo_base_id: GRANO, gramaje_shot: null },
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    expect(await codigoDe(() => registrarCalibracion.ejecutar(ctx, { shots: 4 }))).toBe(
      'CATALOGO_INVALIDO',
    );
  });

  it('veinte shots es el tope: más es un tecleo', () => {
    expect(registrarCalibracion.entrada.safeParse({ shots: 21 }).success).toBe(false);
    expect(registrarCalibracion.entrada.safeParse({ shots: 0 }).success).toBe(false);
  });
});

describe('F-156 · los gramos por shot, sin coma flotante', () => {
  it('multiplica exacto', () => {
    expect(porShots('18.0000', 4)).toBe('72.0000');
    expect(porShots('17.5000', 3)).toBe('52.5000');
    expect(porShots('0.3333', 3)).toBe('0.9999');
  });

  it('no arrastra error en decenas de shots', () => {
    // `0.1 * 3` en coma flotante es `0.30000000000000004`. Aquí no.
    expect(porShots('0.1000', 3)).toBe('0.3000');
    expect(porShots('18.3300', 20)).toBe('366.6000');
  });
});
