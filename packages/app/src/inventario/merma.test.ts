import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import {
  contextoFalso,
  crearBaseFalsa,
  type Fila,
  type TablasFalsas,
} from '../restaurante/pruebas/base-falsa.ts';
import { ambitoDe } from '../restaurante/pruebas/sala.ts';
import { registrarMerma } from './merma.ts';

/**
 * F-109 · El comando de merma.
 *
 * ── Lo que esta prueba defiende ────────────────────────────────────────────
 * Que el motivo salga de la TABLA y no del teclado. Hoy —antes de esto— la
 * merma se registraba como un ajuste con texto libre, así que «caducó» y «se lo
 * llevaron» acababan en el mismo número y el reporte de mermas no servía para
 * decidir nada.
 */

const ALMACEN = 'a1111111-1111-4111-8111-111111111111';
const INSUMO = 'b2222222-2222-4222-8222-222222222222';
const AHORA = new Date('2026-09-15T19:00:00.000Z');

function motivos(): Fila[] {
  return [
    { clave: 'caducado', etiqueta: 'Caducado', giro: null, imputable: false, activo: true },
    {
      clave: 'robo',
      etiqueta: 'Faltante sin explicación',
      giro: null,
      imputable: true,
      activo: true,
    },
    { clave: 'retirado', etiqueta: 'Motivo viejo', giro: null, imputable: false, activo: false },
  ];
}

function baseDe(extra: Partial<TablasFalsas> = {}, hayExistencia = true) {
  return crearBaseFalsa(
    { motivos_merma: motivos(), movimientos_stock: [], ...extra },
    {
      filasCrudas: hayExistencia ? [{ cantidad: '5.0000' }] : [],
      predeterminados: {
        movimientos_stock: {
          referencia_tipo: null,
          referencia_id: null,
          motivo: null,
          empleado_id: null,
          costo_unitario_centavos: 0n,
          idempotency_key: null,
          sesion_caja_id: null,
        },
      },
    },
  );
}

describe('F-109 · registrar una merma', () => {
  it('escribe el movimiento en negativo, con tipo `merma` y la CLAVE del motivo', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('almacen'), AHORA);

    const salida = await registrarMerma.ejecutar(ctx, {
      almacenId: ALMACEN,
      insumoId: INSUMO,
      estrategia: 'insumo',
      cantidad: '2.0000',
      unidad: 'kg',
      factorABase: '1',
      motivoClave: 'caducado',
    });

    expect(base.campo('movimientos_stock', 'tipo')).toBe('merma');
    expect(base.campo('movimientos_stock', 'cantidad')).toBe('-2.0000');
    // La CLAVE, no la etiqueta: la etiqueta se puede cambiar sin migración y el
    // reporte de seis meses agrupa por clave.
    expect(base.campo('movimientos_stock', 'motivo')).toBe('caducado');
    expect(salida.imputable).toBe(false);
  });

  it('marca la merma IMPUTABLE, que es la que dispara una revisión', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    const salida = await registrarMerma.ejecutar(ctx, {
      almacenId: ALMACEN,
      insumoId: INSUMO,
      estrategia: 'insumo',
      cantidad: '1',
      unidad: 'pieza',
      factorABase: '1',
      motivoClave: 'robo',
    });

    expect(salida.imputable).toBe(true);
  });

  it('guarda la CLAVE en su columna y la nota en la suya', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    await registrarMerma.ejecutar(ctx, {
      almacenId: ALMACEN,
      insumoId: INSUMO,
      estrategia: 'insumo',
      cantidad: '1',
      unidad: 'pieza',
      factorABase: '1',
      motivoClave: 'caducado',
      nota: 'La caja se mojó con la lluvia del martes',
    });

    // LA CLAVE SOLA. Pegarle la nota con dos puntos la convertía en un valor que
    // `motivos_merma` no tiene, y la base rechazaba la merma entera: declarar una
    // merma CON nota era imposible, que es justo lo que este caso prueba.
    expect(base.campo('movimientos_stock', 'motivo')).toBe('caducado');
    expect(base.campo('movimientos_stock', 'nota')).toBe(
      'La caja se mojó con la lluvia del martes',
    );
  });

  it('convierte a la unidad base antes de descontar', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('almacen'), AHORA);

    await registrarMerma.ejecutar(ctx, {
      almacenId: ALMACEN,
      insumoId: INSUMO,
      estrategia: 'presentacion',
      cantidad: '2',
      unidad: 'caja',
      factorABase: '12',
      motivoClave: 'caducado',
    });

    expect(base.campo('movimientos_stock', 'cantidad')).toBe('-24.0000');
  });

  it('rechaza un motivo que no está en la tabla', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('almacen'), AHORA);

    const fallo = await registrarMerma
      .ejecutar(ctx, {
        almacenId: ALMACEN,
        insumoId: INSUMO,
        estrategia: 'insumo',
        cantidad: '1',
        unidad: 'pieza',
        factorABase: '1',
        motivoClave: 'se me cayo',
      })
      .catch((e: unknown) => e);

    // Texto libre no es un motivo: es lo que hacía que la merma y el robo
    // fueran el mismo número.
    expect(esErrorDominio(fallo)).toBe(true);
    expect(base.filas('movimientos_stock')).toHaveLength(0);
  });

  it('rechaza un motivo apagado', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('almacen'), AHORA);

    const fallo = await registrarMerma
      .ejecutar(ctx, {
        almacenId: ALMACEN,
        insumoId: INSUMO,
        estrategia: 'insumo',
        cantidad: '1',
        unidad: 'pieza',
        factorABase: '1',
        motivoClave: 'retirado',
      })
      .catch((e: unknown) => e);

    expect(esErrorDominio(fallo)).toBe(true);
    expect(base.filas('movimientos_stock')).toHaveLength(0);
  });

  it('si la guarda de existencia rechaza, no queda movimiento', async () => {
    const base = baseDe({}, false);
    const { ctx } = contextoFalso(base.tx, ambitoDe('almacen'), AHORA);

    const fallo = await registrarMerma
      .ejecutar(ctx, {
        almacenId: ALMACEN,
        insumoId: INSUMO,
        estrategia: 'insumo',
        cantidad: '99',
        unidad: 'kg',
        factorABase: '1',
        motivoClave: 'caducado',
      })
      .catch((e: unknown) => e);

    expect(esErrorDominio(fallo)).toBe(true);
    expect(base.filas('movimientos_stock')).toHaveLength(0);
  });
});

describe('F-109 · el retazo que sí sirve', () => {
  it('NO escribe movimiento de stock, y dice cuánto se recupera', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('almacen'), AHORA);

    const salida = await registrarMerma.ejecutar(ctx, {
      almacenId: ALMACEN,
      insumoId: INSUMO,
      estrategia: 'retazo',
      cantidad: '1.2000',
      unidad: 'm',
      factorABase: '1',
      motivoClave: 'caducado',
      minimoUtilBase: '0.5000',
    });

    // Un metro veinte de cable se vuelve a vender. Restarlo del inventario
    // haría que faltara cable que sigue en el estante.
    expect(salida.seRecupera).toBe(true);
    expect(salida.movimientoId).toBeNull();
    expect(salida.recuperadoBase).toBe('1.2000');
    expect(base.filas('movimientos_stock')).toHaveLength(0);
  });

  it('un retazo POR DEBAJO del mínimo sí baja del almacén', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('almacen'), AHORA);

    const salida = await registrarMerma.ejecutar(ctx, {
      almacenId: ALMACEN,
      insumoId: INSUMO,
      estrategia: 'retazo',
      cantidad: '0.0800',
      unidad: 'm',
      factorABase: '1',
      motivoClave: 'caducado',
      minimoUtilBase: '0.5000',
    });

    expect(salida.seRecupera).toBe(false);
    expect(base.campo('movimientos_stock', 'cantidad')).toBe('-0.0800');
  });
});
