import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import {
  repartirPoolPorPuntos,
  repartirPropinaPorTramos,
  type BeneficiarioDePool,
  type TramoDeAtencion,
} from './propina-repartida.ts';

/**
 * F-242 y F-325 · A quién le toca esta propina.
 *
 * La regla que estas pruebas vigilan es UNA: **lo repartido suma exactamente lo
 * que había.** Repartir $5,000 de propina en cinco personas y que sumen $4,999
 * no es un error de redondeo: es un pleito, y el sistema existe para cerrarlo.
 */

function tramo(empleadoId: string, inicio: bigint, fin: bigint | null): TramoDeAtencion {
  return { empleadoId, consumoInicioCentavos: inicio, consumoFinCentavos: fin };
}

function puesto(empleadoId: string, nombre: string, puntos: number): BeneficiarioDePool {
  return { empleadoId, puesto: nombre, puntosCentesimas: puntos * 100 };
}

function codigo(fn: () => unknown): string {
  try {
    fn();
    return 'NO LANZÓ';
  } catch (error) {
    return esErrorDominio(error) ? error.codigo : `INESPERADO: ${String(error)}`;
  }
}

describe('F-325 · la propina de una cuenta que cambió de mesero', () => {
  it('sin relevo, toda es de quien la atendió', () => {
    const r = repartirPropinaPorTramos(10_000n, [tramo('a', 0n, null)], 50_000n);
    expect(r).toEqual([{ empleadoId: 'a', propinaCentavos: 10_000n }]);
  });

  it('SE REPARTE POR LO QUE CADA UNO LEVANTÓ, no por minutos', () => {
    // El de mediodía levantó $300 y el de la noche $100. La propina de $40 se
    // parte 30/10, no mitad y mitad por «los dos estuvieron».
    const r = repartirPropinaPorTramos(
      4_000n,
      [tramo('mediodia', 0n, 30_000n), tramo('noche', 30_000n, null)],
      40_000n,
    );
    expect(r.map((p) => p.propinaCentavos)).toEqual([3_000n, 1_000n]);
  });

  it('LA MESA QUE SE QUEDÓ CON EL CAFÉ no le debe propina a quien la relevó', () => {
    const r = repartirPropinaPorTramos(
      4_000n,
      [tramo('mediodia', 0n, 40_000n), tramo('noche', 40_000n, null)],
      40_000n,
    );
    expect(r.map((p) => p.propinaCentavos)).toEqual([4_000n, 0n]);
  });

  it('si nadie levantó nada, partes iguales: los dos estuvieron', () => {
    const r = repartirPropinaPorTramos(
      1_000n,
      [tramo('a', 40_000n, 40_000n), tramo('b', 40_000n, null)],
      40_000n,
    );
    expect(r.map((p) => p.propinaCentavos)).toEqual([500n, 500n]);
  });

  it('cuadra para cientos de importes y de cortes', () => {
    for (let propina = 1; propina <= 400; propina += 1) {
      for (const corte of [1n, 7n, 3333n, 29_999n]) {
        const r = repartirPropinaPorTramos(
          BigInt(propina),
          [tramo('a', 0n, corte), tramo('b', corte, null), tramo('c', corte, null)],
          30_000n,
        );
        const suma = r.reduce((a, p) => a + p.propinaCentavos, 0n);
        expect(suma, `${propina} con corte ${corte}`).toBe(BigInt(propina));
      }
    }
  });

  it('una anulación posterior no le da propina negativa a nadie', () => {
    const r = repartirPropinaPorTramos(
      2_000n,
      // El segundo tramo cierra con MENOS consumo: alguien anuló un platillo.
      [tramo('a', 0n, 30_000n), tramo('b', 30_000n, 20_000n)],
      20_000n,
    );
    expect(r.map((p) => p.propinaCentavos)).toEqual([2_000n, 0n]);
    expect(r.every((p) => p.propinaCentavos >= 0n)).toBe(true);
  });

  it('sin tramos no reparte nada, en vez de inventar un destinatario', () => {
    expect(repartirPropinaPorTramos(1_000n, [], 0n)).toEqual([]);
  });
});

describe('F-242 · el pool del turno por puntos', () => {
  const PLANTILLA = [
    puesto('m1', 'mesero', 10),
    puesto('g1', 'garrotero', 5),
    puesto('c1', 'cocina', 4),
    puesto('l1', 'lavaloza', 1),
  ];

  it('reparte proporcional a los puntos del puesto', () => {
    const r = repartirPoolPorPuntos(200_000n, PLANTILLA);
    const porId = new Map(r.map((p) => [p.empleadoId, p.montoCentavos]));
    expect(porId.get('m1')).toBe(100_000n);
    expect(porId.get('g1')).toBe(50_000n);
    expect(porId.get('c1')).toBe(40_000n);
    expect(porId.get('l1')).toBe(10_000n);
  });

  it('LO REPARTIDO SUMA EL TOTAL, al centavo, para cientos de importes', () => {
    for (let total = 1; total <= 600; total += 1) {
      const r = repartirPoolPorPuntos(BigInt(total), PLANTILLA);
      const suma = r.reduce((a, p) => a + p.montoCentavos, 0n);
      expect(suma, `${total} centavos`).toBe(BigInt(total));
    }
  });

  it('EL CENTAVO QUE SOBRA VA AL DE MÁS PUNTOS, y no se sortea', () => {
    // $10.01 entre 10/5/4/1 puntos: 5.005, 2.5025, 2.002, 0.5005.
    const r = repartirPoolPorPuntos(1_001n, PLANTILLA);
    const porId = new Map(r.map((p) => [p.empleadoId, p.montoCentavos]));
    expect(porId.get('m1')).toBe(501n);
    expect(r.reduce((a, p) => a + p.montoCentavos, 0n)).toBe(1_001n);
  });

  it('dos noches con la misma plantilla reparten IGUAL', () => {
    const uno = repartirPoolPorPuntos(1_001n, PLANTILLA);
    const dos = repartirPoolPorPuntos(1_001n, [...PLANTILLA].reverse());
    const clave = (p: { empleadoId: string; montoCentavos: bigint }) =>
      `${p.empleadoId}:${p.montoCentavos.toString()}`;
    expect(new Set(uno.map(clave))).toEqual(new Set(dos.map(clave)));
  });

  it('con puntos iguales manda el id, no el orden en que llegaron', () => {
    const empate = [puesto('zz', 'cocina', 1), puesto('aa', 'lavaloza', 1)];
    const r = repartirPoolPorPuntos(3n, empate);
    const porId = new Map(r.map((p) => [p.empleadoId, p.montoCentavos]));
    expect(porId.get('aa')).toBe(2n);
    expect(porId.get('zz')).toBe(1n);
  });

  it('conserva el puesto y los puntos para congelarlos en el documento', () => {
    const r = repartirPoolPorPuntos(1_000n, [puesto('c1', 'cocina', 4)]);
    expect(r[0]?.puesto).toBe('cocina');
    expect(r[0]?.puntosCentesimas).toBe(400);
  });

  it('un esquema sin beneficiarios no reparte al vacío', () => {
    expect(codigo(() => repartirPoolPorPuntos(1_000n, []))).toBe('LIQUIDACION_INVALIDA');
  });

  it('UN ESQUEMA DE CERO PUNTOS falla en vez de dejar el total sin repartir', () => {
    expect(codigo(() => repartirPoolPorPuntos(1_000n, [puesto('m1', 'mesero', 0)]))).toBe(
      'LIQUIDACION_INVALIDA',
    );
  });
});
