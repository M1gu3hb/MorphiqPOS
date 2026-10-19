import { describe, expect, it } from 'vitest';

import { centavosDelPuente } from './dinero-del-puente';

/**
 * EL PUENTE SIRVE EN PESOS lo que se llama `…_centavos`. Los campos con
 * `conversion: 'dinero'` pasan por `haciaEl`, que divide entre 100: una remisión de
 * $18,000.00 llega como `18000`. La revisión adversarial encontró cinco pantallas que
 * se lo daban así a `<Dinero centavos>` —y pintaban $180.00— o lo mandaban en un pago.
 * Esta es LA conversión de vuelta, contando dígitos y no multiplicando por 100.
 */
describe('centavosDelPuente · de los pesos del puente a centavos enteros', () => {
  const casos: readonly (readonly [number | string | null | undefined, number | null])[] = [
    [18000, 1_800_000],
    [1840.5, 184_050],
    [58.99, 5899],
    [0.07, 7],
    [2.8, 280],
    [1180, 118_000],
    [0, 0],
    [-42.9, -4290],
    ['1234.50', 123_450],
    [null, null],
    [undefined, null],
    [Number.NaN, null],
    ['abc', null],
  ];
  for (const [pesos, centavos] of casos) {
    it(`${String(pesos)} → ${String(centavos)}`, () => {
      expect(centavosDelPuente(pesos)).toBe(centavos);
    });
  }

  it('ida y vuelta con `haciaEl` en todo el rango de un ticket, sin perder un centavo', () => {
    for (let centavos = -50_000; centavos <= 5_000_000; centavos += 997) {
      expect(centavosDelPuente(centavos / 100)).toBe(centavos);
    }
  });
});
