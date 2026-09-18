import { describe, expect, it } from 'vitest';

import {
  componerRanking,
  ordenarPor,
  vendeMuchoDejaPoco,
  type VentaDeProducto,
} from './mas-vendidos.ts';

/**
 * F-051 · Los más vendidos, y por qué no es un ranking.
 *
 * ── Lo que estas pruebas defienden ───────────────────────────────────────
 * Que las tres listas sean DISTINTAS y que se puedan ver las tres. La de piezas
 * la encabezan los tornillos, que dejan centavos; la de dinero, el cemento; y
 * la que decide qué comprar es la de margen por capital parado, porque el
 * cuello de botella de una ferretería no es el espacio: es el dinero dormido en
 * el patio. Una sola cifra con nombre de ranking hace que el dueño compre más
 * de lo que ya le sobra.
 */

function venta(cambios: Partial<VentaDeProducto> = {}): VentaDeProducto {
  return {
    productoId: 'p1',
    nombre: 'Tornillo 1/4',
    unidades: 4000,
    ingresoCentavos: 40_000n,
    costoCentavos: 28_000n,
    inventarioCentavos: 60_000n,
    ...cambios,
  };
}

const CATALOGO = [
  // Se vende a miles y deja centavos.
  venta({
    productoId: 'tornillo',
    nombre: 'Tornillo 1/4',
    unidades: 4000,
    ingresoCentavos: 40_000n,
    costoCentavos: 28_000n,
    inventarioCentavos: 60_000n,
  }),
  // Poca pieza, mucho dinero.
  venta({
    productoId: 'cemento',
    nombre: 'Cemento gris',
    unidades: 90,
    ingresoCentavos: 1_800_000n,
    costoCentavos: 1_500_000n,
    inventarioCentavos: 900_000n,
  }),
  // Poco de todo, pero el capital rinde.
  venta({
    productoId: 'broca',
    nombre: 'Broca de cobalto',
    unidades: 40,
    ingresoCentavos: 120_000n,
    costoCentavos: 60_000n,
    inventarioCentavos: 30_000n,
  }),
];

describe('F-051 · las tres listas son distintas', () => {
  const filas = componerRanking(CATALOGO);

  it('por PIEZAS gana el tornillo', () => {
    expect(ordenarPor(filas, 'unidades')[0]?.productoId).toBe('tornillo');
  });

  it('por DINERO gana el cemento', () => {
    expect(ordenarPor(filas, 'ingreso')[0]?.productoId).toBe('cemento');
  });

  it('POR CAPITAL PARADO gana la broca, y ésa es la que decide qué comprar', () => {
    // $600 de margen sobre $300 de inventario: 200 % de rendimiento. El cemento
    // deja $3,000 sobre $9,000 —un 33 %— y el tornillo $120 sobre $600, un 20 %.
    expect(ordenarPor(filas, 'capital')[0]?.productoId).toBe('broca');
  });

  it('el margen por capital va en puntos base', () => {
    const broca = filas.find((f) => f.productoId === 'broca');

    expect(broca?.margenCentavos).toBe(60_000n);
    expect(broca?.margenPorCapitalBp).toBe(20_000);
  });
});

describe('F-051 · lo que no se puede dividir', () => {
  it('sin inventario, el rendimiento es `null` y NO infinito', () => {
    const filas = componerRanking([venta({ inventarioCentavos: 0n })]);

    expect(filas[0]?.margenPorCapitalBp).toBeNull();
  });

  it('y lo que no tiene inventario va AL FINAL, no al principio', () => {
    // Recomendar comprar más de lo que ya se acabó es el consejo contrario al
    // que hace falta: lo que se acabó ya se pidió.
    const filas = componerRanking([
      venta({ productoId: 'agotado', nombre: 'Agotado', inventarioCentavos: 0n }),
      venta({ productoId: 'broca', nombre: 'Broca', inventarioCentavos: 30_000n }),
    ]);

    expect(ordenarPor(filas, 'capital').map((f) => f.productoId)).toEqual(['broca', 'agotado']);
  });

  it('unidades negativas se rechazan en vez de ordenarse', () => {
    expect(() => componerRanking([venta({ unidades: -1 })])).toThrow();
  });
});

describe('F-051 · el orden es estable', () => {
  it('dos productos con el mismo número se desempatan por nombre', () => {
    // Sin desempate, el reporte se reordena solo entre una consulta y la
    // siguiente, y un reporte que se mueve deja de creerse.
    const filas = componerRanking([
      venta({ productoId: 'b', nombre: 'Bisagra', unidades: 100 }),
      venta({ productoId: 'a', nombre: 'Abrazadera', unidades: 100 }),
    ]);

    expect(ordenarPor(filas, 'unidades').map((f) => f.nombre)).toEqual(['Abrazadera', 'Bisagra']);
  });

  it('ordenar NO muta lo que recibe', () => {
    const filas = componerRanking(CATALOGO);
    const antes = filas.map((f) => f.productoId);
    ordenarPor(filas, 'ingreso');

    expect(filas.map((f) => f.productoId)).toEqual(antes);
  });
});

describe('F-051 · lo que se vende mucho y deja poco', () => {
  it('saca la lista que nadie pide con esas palabras', () => {
    // El tornillo: primero en piezas y en la mitad de abajo por margen. Es la
    // lista que de verdad cambia decisiones de compra.
    const filas = componerRanking(CATALOGO);

    expect(vendeMuchoDejaPoco(filas).map((f) => f.productoId)).toEqual(['tornillo']);
  });

  it('respeta cuántos se le piden', () => {
    const filas = componerRanking(CATALOGO);

    expect(vendeMuchoDejaPoco(filas, 1)).toHaveLength(1);
  });

  it('pedir cero es un error y no una lista vacía', () => {
    expect(() => vendeMuchoDejaPoco(componerRanking(CATALOGO), 0)).toThrow();
  });
});
