import { describe, expect, it } from 'vitest';

import { Azar, azarDelDia, idDeterminista, valorEstable } from './historial-azar.ts';

/**
 * El azar del historial es determinista: sin eso no hay prueba posible de que lo sembrado
 * cuadra, y una demostración que se ve distinta cada vez no se puede ensayar.
 */

describe('Azar', () => {
  it('la misma semilla da la misma secuencia y otra, otra', () => {
    const a = new Azar(42);
    const b = new Azar(42);
    const c = new Azar(43);
    const sacar = (x: Azar): number[] => Array.from({ length: 20 }, () => x.siguiente());
    expect(sacar(a)).toEqual(sacar(b));
    expect(sacar(new Azar(42))).not.toEqual(sacar(c));
  });

  it('siempre devuelve [0, 1) y los enteros caen en su rango, extremos incluidos', () => {
    const azar = new Azar(7);
    const vistos = new Set<number>();
    for (let i = 0; i < 2_000; i += 1) {
      const real = azar.siguiente();
      expect(real).toBeGreaterThanOrEqual(0);
      expect(real).toBeLessThan(1);
      vistos.add(azar.entero(3, 6));
    }
    expect([...vistos].sort()).toEqual([3, 4, 5, 6]);
  });

  it('elegir recorre toda la lista y rechaza una vacía', () => {
    const azar = new Azar(1);
    const vistos = new Set(Array.from({ length: 300 }, () => azar.elegir(['a', 'b', 'c'])));
    expect([...vistos].sort()).toEqual(['a', 'b', 'c']);
    expect(() => azar.elegir([])).toThrow(RangeError);
  });

  it('ponderado respeta los pesos y nunca elige lo que pesa cero', () => {
    const azar = new Azar(99);
    const cuentas = { a: 0, b: 0, c: 0 };
    for (let i = 0; i < 6_000; i += 1) {
      cuentas[
        azar.ponderado([
          { valor: 'a' as const, peso: 1 },
          { valor: 'b' as const, peso: 3 },
          { valor: 'c' as const, peso: 0 },
        ])
      ] += 1;
    }
    expect(cuentas.c).toBe(0);
    expect(cuentas.b / cuentas.a).toBeGreaterThan(2.5);
    expect(cuentas.b / cuentas.a).toBeLessThan(3.5);
    expect(() => azar.ponderado([{ valor: 1, peso: 0 }])).toThrow(RangeError);
  });

  it('cada día de cada espejo tiene su propio flujo, y el mismo día lo repite', () => {
    const primero = azarDelDia(2026, 'org-a', '2026-10-01').siguiente();
    expect(azarDelDia(2026, 'org-a', '2026-10-01').siguiente()).toBe(primero);
    expect(azarDelDia(2026, 'org-a', '2026-10-02').siguiente()).not.toBe(primero);
    expect(azarDelDia(2026, 'org-b', '2026-10-01').siguiente()).not.toBe(primero);
    expect(azarDelDia(2027, 'org-a', '2026-10-01').siguiente()).not.toBe(primero);
  });
});

describe('idDeterminista', () => {
  it('es un uuid versión 4 válido', () => {
    expect(idDeterminista('org', 1, 'dia', 'orden', 3)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('mismas partes, mismo id; cualquier parte distinta, otro id', () => {
    expect(idDeterminista('a', 1)).toBe(idDeterminista('a', 1));
    expect(idDeterminista('a', 1)).not.toBe(idDeterminista('a', 2));
    expect(idDeterminista('a', 1)).not.toBe(idDeterminista('b', 1));
    // El separador impide que ('ab','c') y ('a','bc') colisionen.
    expect(idDeterminista('ab', 'c')).not.toBe(idDeterminista('a', 'bc'));
  });

  it('dos espejos con la misma semilla no comparten ni un id', () => {
    const ids = (org: string): Set<string> =>
      new Set(
        Array.from({ length: 500 }, (_, i) => idDeterminista(org, 2026, '2026-10-01', 'orden', i)),
      );
    const a = ids('org-a');
    const b = ids('org-b');
    expect(a.size).toBe(500);
    expect([...a].filter((id) => b.has(id))).toEqual([]);
  });
});

describe('valorEstable', () => {
  it('es el mismo para la misma clave y cae en [0, 1)', () => {
    expect(valorEstable('popularidad', 'org', 'p1')).toBe(valorEstable('popularidad', 'org', 'p1'));
    expect(valorEstable('popularidad', 'org', 'p1')).not.toBe(
      valorEstable('popularidad', 'org', 'p2'),
    );
    const v = valorEstable('x');
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(1);
  });
});
