import { describe, expect, it } from 'vitest';

import { costoDeLaCita, materialDe } from './costo-del-servicio.ts';

describe('lo que le cuesta al salón la cita', () => {
  it('suma el material de las recetas, del puente en pesos a centavos', () => {
    expect(materialDe([{ costo_linea_calculado: 42.5 }, { costo_linea_calculado: 7.25 }])).toBe(
      4_975,
    );
  });

  it('una línea sin costo deja el material en «no se sabe», no en cero', () => {
    expect(
      materialDe([{ costo_linea_calculado: 42.5 }, { costo_linea_calculado: null }]),
    ).toBeNull();
    expect(materialDe([{ costo_linea_calculado: 42.5 }, {}])).toBeNull();
  });

  it('le queda el precio menos material y comisión', () => {
    expect(costoDeLaCita(90_000, 4_975, 36_000)).toEqual({
      materialCentavos: 4_975,
      comisionCentavos: 36_000,
      leQuedaCentavos: 49_025,
    });
  });

  it('sin la comisión no hay «le queda»', () => {
    expect(costoDeLaCita(90_000, 4_975, null).leQuedaCentavos).toBeNull();
  });
});
