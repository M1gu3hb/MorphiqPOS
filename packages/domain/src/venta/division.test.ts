import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import { calcularDivision, type LineaDivisible, type ParticionPedida } from './division.ts';

/**
 * F-321 · Dividir una cuenta.
 *
 * La regla que estas pruebas vigilan es UNA: **la suma de las hijas iguala a la
 * madre, exactamente, al centavo.** Todo lo demás son formas de romperla.
 *
 * El caso que da miedo es el reparto que no cae exacto: una botella de $437
 * entre tres. Redondear hacia abajo deja 2 centavos sin cobrar; hacia arriba
 * cobra 1 que nadie puso. Con 200 tickets al día, cualquiera de los dos
 * descuadra el corte todas las noches por poquito — que es peor que descuadrar
 * por mucho, porque nadie lo investiga.
 */

function linea(id: string, cantidad: number, centavos: bigint): LineaDivisible {
  return { lineaId: id, cantidad, importeCentavos: centavos };
}

function falla(fn: () => unknown): string {
  try {
    fn();
    return 'NO LANZÓ';
  } catch (error) {
    return esErrorDominio(error) ? error.codigo : `INESPERADO: ${String(error)}`;
  }
}

describe('F-321 · la suma de las hijas iguala a la madre', () => {
  it('divide una cuenta simple en dos', () => {
    const lineas = [linea('a', 1, 32900n), linea('b', 2, 11000n)];
    const r = calcularDivision(lineas, [
      { tomas: [{ lineaId: 'a', cantidad: 1 }] },
      { tomas: [{ lineaId: 'b', cantidad: 2 }] },
    ]);
    expect(r.particiones.map((p) => p.totalCentavos)).toEqual([32900n, 11000n]);
    expect(r.totalCentavos).toBe(43900n);
  });

  it('el importe que NO cae exacto no pierde ni inventa centavos', () => {
    // $437.00 entre tres. 43700 / 3 = 14566.66…
    const r = calcularDivision(
      [linea('vino', 3, 43700n)],
      [
        { tomas: [{ lineaId: 'vino', cantidad: 1 }] },
        { tomas: [{ lineaId: 'vino', cantidad: 1 }] },
        { tomas: [{ lineaId: 'vino', cantidad: 1 }] },
      ],
    );
    const trozos = r.particiones.map((p) => p.totalCentavos);
    expect(trozos.reduce((a, b) => a + b, 0n)).toBe(43700n);
    // Nadie recibe más de un centavo de diferencia sobre otro.
    const max = trozos.reduce((a, b) => (b > a ? b : a));
    const min = trozos.reduce((a, b) => (b < a ? b : a));
    expect(max - min).toBeLessThanOrEqual(1n);
  });

  it('cuadra para cientos de importes y divisores, no sólo para el ejemplo', () => {
    // El ejemplo bonito siempre cuadra. Lo que hay que probar es el barrido.
    for (let centavos = 1; centavos <= 400; centavos += 1) {
      for (let partes = 2; partes <= 7; partes += 1) {
        const r = calcularDivision(
          [linea('x', partes, BigInt(centavos))],
          Array.from({ length: partes }, () => ({ tomas: [{ lineaId: 'x', cantidad: 1 }] })),
        );
        const suma = r.particiones.reduce((a, p) => a + p.totalCentavos, 0n);
        expect(suma, `${centavos} centavos entre ${partes}`).toBe(BigInt(centavos));
      }
    }
  });

  it('una devolución se divide en espejo exacto de su cobro', () => {
    const positivo = calcularDivision(
      [linea('x', 3, 43700n)],
      Array.from({ length: 3 }, () => ({ tomas: [{ lineaId: 'x', cantidad: 1 }] })),
    );
    const negativo = calcularDivision(
      [linea('x', 3, -43700n)],
      Array.from({ length: 3 }, () => ({ tomas: [{ lineaId: 'x', cantidad: 1 }] })),
    );
    expect(negativo.particiones.map((p) => p.totalCentavos)).toEqual(
      positivo.particiones.map((p) => -p.totalCentavos),
    );
  });

  it('reparte una línea de varias unidades en proporciones distintas', () => {
    // Cuatro cervezas: dos para uno, una para cada otro.
    const r = calcularDivision(
      [linea('cerveza', 4, 22000n)],
      [
        { tomas: [{ lineaId: 'cerveza', cantidad: 2 }] },
        { tomas: [{ lineaId: 'cerveza', cantidad: 1 }] },
        { tomas: [{ lineaId: 'cerveza', cantidad: 1 }] },
      ],
    );
    expect(r.particiones.map((p) => p.totalCentavos)).toEqual([11000n, 5500n, 5500n]);
  });
});

describe('F-321 · lo que rechaza, y por qué', () => {
  const lineas = [linea('a', 2, 20000n)];

  it('dividir en una sola parte no es dividir', () => {
    expect(
      falla(() => calcularDivision(lineas, [{ tomas: [{ lineaId: 'a', cantidad: 2 }] }])),
    ).toBe('DIVISION_NO_CUADRA');
  });

  it('una parte vacía', () => {
    const pedidas: ParticionPedida[] = [{ tomas: [{ lineaId: 'a', cantidad: 2 }] }, { tomas: [] }];
    expect(falla(() => calcularDivision(lineas, pedidas))).toBe('DIVISION_NO_CUADRA');
  });

  it('una línea que no es de esta cuenta — cobrar algo que nadie pidió', () => {
    expect(
      falla(() =>
        calcularDivision(lineas, [
          { tomas: [{ lineaId: 'a', cantidad: 2 }] },
          { tomas: [{ lineaId: 'ajena', cantidad: 1 }] },
        ]),
      ),
    ).toBe('DIVISION_NO_CUADRA');
  });

  it('DEJAR UNIDADES SIN REPARTIR — consumo que nadie paga', () => {
    // Es el defecto que el cajero comete hoy a mano, y la razón de que esto
    // exista. Falla en vez de silenciar.
    //
    // El caso se arma con DOS líneas a propósito: si las dos particiones
    // hablaran de la misma línea con una en cero, fallaría antes por «cada
    // parte se lleva al menos una unidad» y esta prueba estaría comprobando
    // otra cosa. Aquí la parte 2 es legítima y lo que sobra es una unidad de
    // «a» que nadie se lleva.
    const dos = [linea('a', 2, 20000n), linea('b', 1, 5000n)];
    expect(
      falla(() =>
        calcularDivision(dos, [
          { tomas: [{ lineaId: 'a', cantidad: 1 }] },
          { tomas: [{ lineaId: 'b', cantidad: 1 }] },
        ]),
      ),
    ).toBe('DIVISION_NO_CUADRA');
  });

  it('REPARTIR MÁS DE LO QUE HAY — cobrar dos veces el mismo platillo', () => {
    expect(
      falla(() =>
        calcularDivision(lineas, [
          { tomas: [{ lineaId: 'a', cantidad: 2 }] },
          { tomas: [{ lineaId: 'a', cantidad: 1 }] },
        ]),
      ),
    ).toBe('DIVISION_NO_CUADRA');
  });

  it('cantidades fraccionarias o negativas', () => {
    for (const cantidad of [0.5, -1, 0]) {
      expect(
        falla(() =>
          calcularDivision(lineas, [
            { tomas: [{ lineaId: 'a', cantidad }] },
            { tomas: [{ lineaId: 'a', cantidad: 2 }] },
          ]),
        ),
        `cantidad ${cantidad}`,
      ).toBe('DIVISION_NO_CUADRA');
    }
  });
});
