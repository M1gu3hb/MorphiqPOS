import { describe, expect, it } from 'vitest';

import {
  asignacionesParaEditar,
  asignacionesParaGuardar,
  minutosConFactor,
  type AsignacionEditable,
} from './quien-da-el-servicio.ts';

const KARLA = { id: 'k', nombre_corto: 'Karla', activo: true };
const DANY = { id: 'd', nombre_corto: 'Dany', activo: true };
const SOL = { id: 's', nombre_corto: 'Sol', activo: false };

describe('quién da el servicio', () => {
  it('las activas, con lo que ya tenían guardado; la dada de baja no aparece', () => {
    const editables = asignacionesParaEditar(
      [KARLA, DANY, SOL],
      [{ servicioId: 't', profesionalId: 'd', precioCentavos: '110000', factorDuracionBp: 11_000 }],
    );
    expect(editables).toEqual([
      {
        profesionalId: 'k',
        nombre: 'Karla',
        da: false,
        factorPorciento: '100',
        precioCentavos: null,
      },
      {
        profesionalId: 'd',
        nombre: 'Dany',
        da: true,
        factorPorciento: '110',
        precioCentavos: 110_000,
      },
    ]);
  });

  it('viajan sólo las que lo dan, con el factor en puntos base', () => {
    const editables: AsignacionEditable[] = [
      {
        profesionalId: 'k',
        nombre: 'Karla',
        da: true,
        factorPorciento: '80',
        precioCentavos: null,
      },
      {
        profesionalId: 'd',
        nombre: 'Dany',
        da: false,
        factorPorciento: '110',
        precioCentavos: null,
      },
    ];
    expect(asignacionesParaGuardar(editables)).toEqual({
      ok: true,
      asignaciones: [{ profesionalId: 'k', precioCentavos: null, factorDuracionBp: 8_000 }],
    });
  });

  it('un factor fuera del 25–400 % se dice con el nombre de quien lo tiene', () => {
    const resultado = asignacionesParaGuardar([
      {
        profesionalId: 'k',
        nombre: 'Karla',
        da: true,
        factorPorciento: '500',
        precioCentavos: null,
      },
    ]);
    expect(resultado).toEqual({
      ok: false,
      problema: 'El tiempo de Karla va del 25 al 400 % del catálogo.',
    });
  });

  it('el factor acepta coma decimal', () => {
    const resultado = asignacionesParaGuardar([
      {
        profesionalId: 'k',
        nombre: 'Karla',
        da: true,
        factorPorciento: '87,5',
        precioCentavos: null,
      },
    ]);
    expect(resultado.ok && resultado.asignaciones[0]?.factorDuracionBp).toBe(8_750);
  });

  it('los minutos de esa persona son el factor sobre lo activo', () => {
    expect(minutosConFactor(70, '80')).toBe(56);
    expect(minutosConFactor(70, 'x')).toBeNull();
  });
});
