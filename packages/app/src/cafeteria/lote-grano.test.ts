import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import { contextoFalso, crearBaseFalsa, type Fila } from '../restaurante/pruebas/base-falsa.ts';
import { ambitoDe, ORG, SUCURSAL } from '../restaurante/pruebas/sala.ts';
import { abrirLoteGrano, diasEntre } from './lote-grano.ts';

/**
 * F-157 · La frescura del grano.
 *
 * Se usa grano de cinco semanas para espresso y el cliente lo nota antes que la
 * dueña. Lo que estas pruebas vigilan es lo poco que esta función promete y que
 * cumpla exactamente eso: qué lote está en la tolva HOY y cuántos días lleva
 * del tueste. No traza, y no pretende trazar.
 */

const GRANO = 'b1111111-1111-4111-8111-11111111111a';
const AHORA = new Date('2026-09-15T07:00:00.000Z');

function almacen(extra: Record<string, readonly Fila[]> = {}) {
  return crearBaseFalsa(
    {
      insumos: [{ id: GRANO, organizacion_id: ORG, nombre: 'Café', dias_frescura_optima: 21 }],
      lotes_grano: [],
      ...extra,
    },
    {
      // Columnas anulables sin `default`: Postgres las escribe en `null` y la
      // base falsa tiene que hacer lo mismo, o «todavía no se agota» leería
      // `undefined` y la prueba pasaría por casualidad.
      predeterminados: { lotes_grano: { agotado_en: null, compra_linea_id: null } },
    },
  );
}

const BOLSA = { insumoId: GRANO, fechaTueste: '2026-09-01', gramosRecibidos: '1000.0000' };

async function codigoDe(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return 'NO LANZÓ';
  } catch (error) {
    return esErrorDominio(error) ? error.codigo : `INESPERADO: ${String(error)}`;
  }
}

describe('F-157 · abrir la bolsa', () => {
  it('queda el lote abierto con su fecha de tueste y sus días', async () => {
    const base = almacen();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await abrirLoteGrano.ejecutar(ctx, BOLSA);

    expect(salida.diasDeTueste).toBe(14);
    expect(salida.yaPasoSuFrescura).toBe(false);
    expect(base.campo('lotes_grano', 'abierto_en')).toEqual(AHORA);
    expect(base.campo('lotes_grano', 'agotado_en')).toBeNull();
  });

  it('ABRIR UNO CIERRA EL ANTERIOR: sólo hay una tolva', async () => {
    const base = almacen({
      lotes_grano: [
        {
          id: 'viejo',
          organizacion_id: ORG,
          sucursal_id: SUCURSAL,
          insumo_id: GRANO,
          fecha_tueste: '2026-08-01',
          abierto_en: new Date('2026-08-10T07:00:00.000Z'),
          agotado_en: null,
        },
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await abrirLoteGrano.ejecutar(ctx, BOLSA);

    expect(salida.cerroAnterior).toBe('viejo');
    const viejo = base.filas('lotes_grano').find((l) => l['id'] === 'viejo');
    expect(viejo?.['agotado_en']).toEqual(AHORA);
    const abiertos = base.filas('lotes_grano').filter((l) => l['agotado_en'] === null);
    expect(abiertos).toHaveLength(1);
  });

  it('LA CACHÉ DEL INSUMO APUNTA AL LOTE NUEVO', async () => {
    const base = almacen();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await abrirLoteGrano.ejecutar(ctx, BOLSA);

    expect(base.campo('insumos', 'lote_abierto_id')).toBe(salida.loteId);
  });

  it('UNA BOLSA VIEJA SE ABRE IGUAL, y el sistema lo DICE', async () => {
    // Abrir café pasado es una decisión del negocio —se usa para filtrado, no
    // para espresso— y bloquearla dejaría al barista sin café. Lo que el
    // sistema hace es decirlo, que es lo que hoy nadie dice.
    const base = almacen();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await abrirLoteGrano.ejecutar(ctx, {
      ...BOLSA,
      fechaTueste: '2026-07-01',
    });

    expect(salida.yaPasoSuFrescura).toBe(true);
    expect(base.filas('lotes_grano')).toHaveLength(1);
  });

  it('UN TUESTE FUTURO es un tecleo, y sí se rechaza', async () => {
    const base = almacen();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    expect(
      await codigoDe(() => abrirLoteGrano.ejecutar(ctx, { ...BOLSA, fechaTueste: '2027-01-01' })),
    ).toBe('CATALOGO_INVALIDO');
    expect(base.filas('lotes_grano')).toEqual([]);
  });

  it('un insumo de otro negocio', async () => {
    const base = almacen({ insumos: [] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    expect(await codigoDe(() => abrirLoteGrano.ejecutar(ctx, BOLSA))).toBe('INVENTARIO_INVALIDO');
  });

  it('un insumo SIN ventana de frescura no reporta que pasó nada', async () => {
    const base = almacen({
      insumos: [{ id: GRANO, organizacion_id: ORG, nombre: 'Azúcar', dias_frescura_optima: null }],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await abrirLoteGrano.ejecutar(ctx, { ...BOLSA, fechaTueste: '2020-01-01' });

    expect(salida.yaPasoSuFrescura).toBe(false);
  });
});

describe('F-157 · los días, en UTC y sin sorpresas', () => {
  it('cuenta días enteros', () => {
    expect(diasEntre('2026-09-01', '2026-09-15')).toBe(14);
    expect(diasEntre('2026-09-15', '2026-09-15')).toBe(0);
  });

  it('cruza fin de mes y año bisiesto', () => {
    expect(diasEntre('2026-01-31', '2026-02-01')).toBe(1);
    expect(diasEntre('2024-02-28', '2024-03-01')).toBe(2);
  });
});
