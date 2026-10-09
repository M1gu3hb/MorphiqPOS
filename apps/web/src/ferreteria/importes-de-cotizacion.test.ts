import { describe, expect, it } from 'vitest';

import { importeDeLinea, precioConDescuento } from './importes-de-cotizacion.ts';

describe('los importes de la cotización', () => {
  it('el precio con descuento, al centavo y medio hacia arriba', () => {
    expect(precioConDescuento(18_900, 0)).toBe(18_900);
    expect(precioConDescuento(18_900, 10)).toBe(17_010);
    // 333 × 0.925 = 308.025 → 308
    expect(precioConDescuento(333, 7.5)).toBe(308);
    // 250 × 0.97 = 242.5 → 243: el medio centavo sube.
    expect(precioConDescuento(250, 3)).toBe(243);
    expect(precioConDescuento(250, 150)).toBe(0);
  });

  it('el importe es ESE precio por la cantidad: lo mismo que se cotiza', () => {
    // 3 × 308 = 924, no round(333 × 3 × 0.925) = 924.075 → 924 por casualidad; con
    // 12.5 m se ve la diferencia: 12.5 × 243 = 3037.5 → 3038.
    expect(importeDeLinea(333, 3, 7.5)).toBe(924);
    expect(importeDeLinea(250, 12.5, 3)).toBe(3_038);
    expect(importeDeLinea(18_900, 2, 0)).toBe(37_800);
  });
});
