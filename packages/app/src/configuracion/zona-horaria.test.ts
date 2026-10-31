import { describe, expect, it } from 'vitest';

import { ZONA_HORARIA_POR_OMISION, zonaValida } from './zona-horaria.ts';

describe('la zona horaria del negocio (PAR-1, modo espera)', () => {
  it('conserva una zona que el navegador conoce', () => {
    expect(zonaValida('America/Tijuana')).toBe('America/Tijuana');
    expect(zonaValida('America/Cancun')).toBe('America/Cancun');
  });

  it('cae en la de omisión con algo que no es una zona', () => {
    expect(zonaValida('Marte/Olimpo')).toBe(ZONA_HORARIA_POR_OMISION);
    expect(zonaValida('')).toBe(ZONA_HORARIA_POR_OMISION);
    expect(zonaValida(null)).toBe(ZONA_HORARIA_POR_OMISION);
    expect(zonaValida(42)).toBe(ZONA_HORARIA_POR_OMISION);
  });
});
