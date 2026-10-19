import { describe, expect, it } from 'vitest';

import {
  cuerpoDeLaVersion,
  escalonesDe,
  formularioDe,
  reglaEnPalabras,
  reglasVigentes,
  type ReglaDelPuente,
} from './regla-de-comision.ts';

const ESTILISTAS: ReglaDelPuente = {
  id: 'r1',
  nombre: 'Estilistas',
  version: 2,
  esquema: 'porcentaje_fijo',
  tasa_servicio_bp: 40,
  tasa_producto_bp: 10,
  base: 'cobrado',
  sobre_iva: false,
  material: 'salon',
  vigente_desde: '2026-01-01',
  vigente_hasta: null,
};

describe('la regla de comisión en palabras', () => {
  it('se lee como se dice', () => {
    expect(reglaEnPalabras(ESTILISTAS)).toBe(
      '40 % de lo cobrado · 10 % de producto · el material lo pone el salón',
    );
    expect(reglaEnPalabras({ ...ESTILISTAS, esquema: 'sin_comision' })).toBe('Sin comisión');
  });

  it('sólo las vigentes hoy se pueden asignar', () => {
    const vieja = { ...ESTILISTAS, id: 'r0', vigente_hasta: '2025-12-31' };
    expect(reglasVigentes([vieja, ESTILISTAS], '2026-09-25').map((r) => r.id)).toEqual(['r1']);
  });
});

describe('la versión nueva de la regla', () => {
  const formulario = formularioDe(ESTILISTAS, '2026-09-26');

  it('empieza mañana, con los valores de hoy', () => {
    expect(formulario).toMatchObject({ tasaServicio: '40', vigenteDesde: '2026-09-26' });
  });

  it('viaja en puntos base, sobre ESA regla', () => {
    const resultado = cuerpoDeLaVersion(ESTILISTAS, { ...formulario, tasaServicio: '45' });
    expect(resultado.ok && resultado.cuerpo).toMatchObject({
      reglaId: 'r1',
      esquema: 'porcentaje_fijo',
      tasaServicioBp: 4_500,
      tasaProductoBp: 1_000,
      escalones: null,
    });
  });

  it('una tasa de más del 100 % no se manda', () => {
    expect(cuerpoDeLaVersion(ESTILISTAS, { ...formulario, tasaServicio: '140' }).ok).toBe(false);
  });

  it('una versión que no empieza DESPUÉS de la de ahora no se manda', () => {
    const resultado = cuerpoDeLaVersion(ESTILISTAS, { ...formulario, vigenteDesde: '2026-01-01' });
    expect(resultado).toEqual({
      ok: false,
      problema: 'La regla nueva empieza después de la de ahora: lo causado no se recalcula.',
    });
  });

  it('el escalonado conserva su esquema y manda sus escalones en orden', () => {
    const escalonada: ReglaDelPuente = {
      ...ESTILISTAS,
      esquema: 'escalonado',
      escalones: [
        { hastaCentavos: 99_999_999, tasaBp: 4_500 },
        { hastaCentavos: 1_000_000, tasaBp: 3_000 },
      ],
    };
    expect(escalonesDe(escalonada)).toEqual([
      { hastaCentavos: 99_999_999, tasa: '45' },
      { hastaCentavos: 1_000_000, tasa: '30' },
    ]);
    const resultado = cuerpoDeLaVersion(escalonada, formularioDe(escalonada, '2026-09-26'));
    expect(resultado.ok && resultado.cuerpo).toMatchObject({
      esquema: 'escalonado',
      escalones: [
        { hastaCentavos: 1_000_000, tasaBp: 3_000 },
        { hastaCentavos: 99_999_999, tasaBp: 4_500 },
      ],
    });
  });

  it('un escalonado sin escalones no se manda', () => {
    const escalonada = { ...ESTILISTAS, esquema: 'escalonado', escalones: [] };
    expect(cuerpoDeLaVersion(escalonada, formularioDe(escalonada, '2026-09-26')).ok).toBe(false);
  });
});
