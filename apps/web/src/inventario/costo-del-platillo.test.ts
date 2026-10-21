import { describe, expect, it } from 'vitest';

import {
  PISTA_SIN_RECETA,
  economiaDelPlatillo,
  economiaDelProducto,
  lineaTieneCosto,
  type LineaDeCosto,
} from './costo-del-platillo.ts';

/**
 * El costo de un platillo es un número que se CALCULA o es DESCONOCIDO. Nunca cero.
 *
 * Antes las pantallas hacían `lineas.reduce((s, l) => s + (l.costo || 0), 0)`: un
 * platillo sin receta —o con un insumo sin costo— sumaba cero, y cero se convertía en
 * «costo $0.00, margen 100 %», que es la cifra más bonita que puede ver un dueño y la
 * única que seguro es falsa.
 */

/** Una línea con todo lo que el puente sirve a quien ve costos. Los importes, en pesos. */
const linea = (sobreescribe: Partial<LineaDeCosto> = {}): LineaDeCosto => ({
  activo: true,
  ingrediente_nombre: 'Carne',
  cantidad_convertida_unidad_base: 100,
  merma_porcentaje: 0,
  costo_unitario_base_snapshot: 0.2,
  costo_linea_calculado: 20,
  ...sobreescribe,
});

describe('un platillo con receta y todos los costos', () => {
  it('suma las líneas y saca utilidad y margen', () => {
    const economia = economiaDelPlatillo(100, [
      linea({ costo_linea_calculado: 20 }),
      linea({ ingrediente_nombre: 'Pan', costo_linea_calculado: 10 }),
    ]);

    expect(economia.estado).toBe('conocido');
    expect(economia.costo).toBe(30);
    expect(economia.utilidad).toBe(70);
    expect(economia.margen).toBe(70);
    expect(economia.etiqueta).toBeNull();
    expect(economia.pista).toBeNull();
    expect(economia.ingredientesSinCosto).toEqual([]);
  });

  it('suma en centavos enteros: 0.1 + 0.2 es 0.30 y no 0.30000000000000004', () => {
    const economia = economiaDelPlatillo(1, [
      linea({ costo_linea_calculado: 0.1 }),
      linea({ costo_linea_calculado: 0.2 }),
    ]);

    expect(economia.costo).toBe(0.3);
    expect(economia.utilidad).toBe(0.7);
  });

  it('un platillo que cuesta más de lo que se vende tiene utilidad y margen negativos', () => {
    const economia = economiaDelPlatillo(50, [linea({ costo_linea_calculado: 80 })]);

    expect(economia.estado).toBe('conocido');
    expect(economia.utilidad).toBe(-30);
    expect(economia.margen).toBe(-60);
  });

  it('una línea que redondea a cero centavos SÍ tiene costo: un gramo de sal no es desconocido', () => {
    const economia = economiaDelPlatillo(100, [
      linea({ costo_linea_calculado: 20 }),
      linea({
        ingrediente_nombre: 'Sal',
        cantidad_convertida_unidad_base: 0.0001,
        costo_unitario_base_snapshot: 0.01,
        costo_linea_calculado: 0,
      }),
    ]);

    expect(economia.estado).toBe('conocido');
    expect(economia.costo).toBe(20);
  });

  it('sin la línea calculada por el servidor, la calcula con cantidad, merma y costo unitario', () => {
    // 100 g × $0.20 × 1.05 de merma = $21.00
    const economia = economiaDelPlatillo(100, [
      linea({ costo_linea_calculado: undefined, merma_porcentaje: 5 }),
    ]);

    expect(economia.estado).toBe('conocido');
    expect(economia.costo).toBe(21);
  });

  it('las líneas inactivas no cuentan', () => {
    const economia = economiaDelPlatillo(100, [
      linea({ costo_linea_calculado: 20 }),
      linea({ activo: false, ingrediente_nombre: 'Viejo', costo_linea_calculado: 999 }),
    ]);

    expect(economia.costo).toBe(20);
  });
});

describe('un platillo SIN receta', () => {
  it('no tiene costo, utilidad ni margen: no tiene cero', () => {
    const economia = economiaDelPlatillo(100, []);

    expect(economia.estado).toBe('sin_receta');
    expect(economia.costo).toBeNull();
    expect(economia.utilidad).toBeNull();
    expect(economia.margen).toBeNull();
    expect(economia.etiqueta).toBe('Sin receta');
    expect(economia.pista).toBe('Agrega su receta para calcular el margen');
    expect(PISTA_SIN_RECETA).toBe(economia.pista);
  });

  it('con puras líneas inactivas tampoco tiene receta', () => {
    const economia = economiaDelPlatillo(100, [linea({ activo: false })]);

    expect(economia.estado).toBe('sin_receta');
    expect(economia.margen).toBeNull();
  });

  it('sin lista de líneas (aún no llegó) tampoco inventa un cero', () => {
    expect(economiaDelPlatillo(100, undefined).estado).toBe('sin_receta');
    expect(economiaDelPlatillo(100, null).costo).toBeNull();
  });
});

describe('un producto que se REVENDE (sin receta, con costo propio)', () => {
  const reventa = (costo: number | null | undefined) => ({
    estrategia_consumo: 'sku',
    insumo_propio_id: 'insumo-del-producto',
    costo_calculado_actual: costo,
  });

  it('su costo se conoce: es el del producto, y no es «Sin receta»', () => {
    // Agua embotellada: se vende en $25.00 y cuesta $9.00.
    const economia = economiaDelPlatillo(25, [], reventa(9));

    expect(economia.estado).toBe('conocido');
    expect(economia.origen).toBe('producto');
    expect(economia.costo).toBe(9);
    expect(economia.utilidad).toBe(16);
    expect(economia.margen).toBe(64);
    expect(economia.etiqueta).toBeNull();
  });

  it('sin costo propio (cero, nulo o ausente) es desconocido, no 100 %', () => {
    for (const costo of [0, null, undefined]) {
      const economia = economiaDelPlatillo(25, [], reventa(costo));

      expect(economia.estado).toBe('sin_costo');
      expect(economia.costo).toBeNull();
      expect(economia.margen).toBeNull();
      expect(economia.etiqueta).toBe('Costo desconocido');
      expect(economia.pista).toBe('Registra su costo en una compra para calcular el margen');
    }
  });

  it('un producto con receta que se quedó sin líneas NO usa su costo viejo: sigue sin receta', () => {
    const economia = economiaDelPlatillo(100, [], {
      estrategia_consumo: 'receta',
      costo_calculado_actual: 30,
    });

    expect(economia.estado).toBe('sin_receta');
    expect(economia.costo).toBeNull();
  });

  it('un platillo al que se le quitó toda la receta (sku, SIN insumo propio) sigue sin receta', () => {
    // `guardar_receta` con la lista vacía lo deja en `sku` con su último costo; no es reventa.
    const economia = economiaDelPlatillo(100, [], {
      estrategia_consumo: 'sku',
      insumo_propio_id: null,
      costo_calculado_actual: 30,
    });

    expect(economia.estado).toBe('sin_receta');
    expect(economia.costo).toBeNull();
    expect(economia.margen).toBeNull();
  });

  it('con líneas manda la receta, no el costo guardado en el producto', () => {
    const economia = economiaDelPlatillo(100, [linea({ costo_linea_calculado: 20 })], reventa(99));

    expect(economia.origen).toBe('receta');
    expect(economia.costo).toBe(20);
  });

  it('`economiaDelProducto` lee el precio y el costo propio del producto', () => {
    const economia = economiaDelProducto(
      {
        precio_venta: 25,
        estrategia_consumo: 'sku',
        insumo_propio_id: 'insumo-del-producto',
        costo_calculado_actual: 9,
      },
      [],
    );

    expect(economia.margen).toBe(64);
  });
});

describe('un platillo con algún insumo SIN costo', () => {
  it('el costo es desconocido: lo que se ve de las demás líneas no es el costo', () => {
    const economia = economiaDelPlatillo(100, [
      linea({ costo_linea_calculado: 20 }),
      linea({
        ingrediente_nombre: 'Aguacate',
        costo_unitario_base_snapshot: 0,
        costo_linea_calculado: 0,
      }),
    ]);

    expect(economia.estado).toBe('costo_incompleto');
    expect(economia.costo).toBeNull();
    expect(economia.utilidad).toBeNull();
    expect(economia.margen).toBeNull();
    expect(economia.etiqueta).toBe('Costo desconocido');
    expect(economia.ingredientesSinCosto).toEqual(['Aguacate']);
    expect(economia.pista).toContain('Aguacate');
  });

  it('un costo que el puente no sirvió (nulo o ausente) es desconocido, no cero', () => {
    const economia = economiaDelPlatillo(100, [
      linea({ ingrediente_nombre: 'Queso', costo_unitario_base_snapshot: null }),
      linea({
        ingrediente_nombre: 'Tortilla',
        costo_unitario_base_snapshot: undefined,
        costo_linea_calculado: undefined,
      }),
    ]);

    expect(economia.estado).toBe('costo_incompleto');
    expect(economia.ingredientesSinCosto).toEqual(['Queso', 'Tortilla']);
  });

  it('una cantidad que falta también deja la línea sin costo', () => {
    const economia = economiaDelPlatillo(100, [
      linea({
        ingrediente_nombre: 'Crema',
        cantidad_convertida_unidad_base: null,
        costo_linea_calculado: null,
      }),
    ]);

    expect(economia.estado).toBe('costo_incompleto');
    expect(economia.ingredientesSinCosto).toEqual(['Crema']);
  });

  it('no repite el nombre de un insumo que sale en varias líneas y avisa de los que no tienen nombre', () => {
    const sinCosto = { costo_unitario_base_snapshot: 0, costo_linea_calculado: 0 };
    const economia = economiaDelPlatillo(100, [
      linea({ ingrediente_nombre: 'Cebolla', ...sinCosto }),
      linea({ ingrediente_nombre: 'Cebolla', ...sinCosto }),
      linea({ ingrediente_nombre: null, ...sinCosto }),
    ]);

    expect(economia.ingredientesSinCosto).toEqual(['Cebolla', 'un ingrediente']);
  });
});

describe('cada renglón de la ficha', () => {
  it('sabe si tiene costo: el unitario manda, no el importe', () => {
    expect(lineaTieneCosto(linea())).toBe(true);
    expect(lineaTieneCosto(linea({ costo_linea_calculado: 0 }))).toBe(true);
    expect(lineaTieneCosto(linea({ costo_unitario_base_snapshot: 0 }))).toBe(false);
    expect(lineaTieneCosto(linea({ costo_unitario_base_snapshot: null }))).toBe(false);
  });
});

describe('un platillo sin precio', () => {
  it('con costo conocido tiene utilidad, pero el margen sobre cero pesos no existe', () => {
    const economia = economiaDelPlatillo(0, [linea({ costo_linea_calculado: 20 })]);

    expect(economia.estado).toBe('conocido');
    expect(economia.costo).toBe(20);
    expect(economia.utilidad).toBe(-20);
    expect(economia.margen).toBeNull();
    expect(economia.pista).toBe('Define su precio de venta para calcular el margen');
  });

  it('un precio ausente se lee como cero', () => {
    expect(economiaDelPlatillo(undefined, [linea()]).margen).toBeNull();
    expect(economiaDelPlatillo(null, [linea()]).margen).toBeNull();
  });
});
