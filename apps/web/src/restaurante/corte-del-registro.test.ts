import { describe, expect, it } from 'vitest';

import {
  aCentavos,
  diferenciaDelCorte,
  folioConSerie,
  PALABRA_DE_LA_DIFERENCIA,
  sentidoDeLaDiferencia,
} from './corte-del-registro.ts';

describe('la diferencia de un corte, dicha con palabra', () => {
  it('lo que sobra se llama «sobra» y el importe va sin signo', () => {
    expect(diferenciaDelCorte(20)).toEqual({ sentido: 'sobra', centavos: 2000 });
  });

  it('lo que falta se llama «falta» y el importe también va sin signo', () => {
    expect(diferenciaDelCorte(-10)).toEqual({ sentido: 'falta', centavos: 1000 });
  });

  it('un corte exacto CUADRA, con cero centavos', () => {
    expect(diferenciaDelCorte(0)).toEqual({ sentido: 'cuadra', centavos: 0 });
  });

  it('un solo centavo de más ya no cuadra: sobra', () => {
    expect(diferenciaDelCorte(0.01)).toEqual({ sentido: 'sobra', centavos: 1 });
    expect(diferenciaDelCorte(-0.01)).toEqual({ sentido: 'falta', centavos: 1 });
  });

  it('un corte que no guardó su diferencia NO es un corte que cuadra', () => {
    expect(diferenciaDelCorte(null)).toBeNull();
    expect(diferenciaDelCorte(undefined)).toBeNull();
    expect(diferenciaDelCorte('')).toBeNull();
    expect(diferenciaDelCorte('no es un importe')).toBeNull();
  });

  it('el sentido sale del signo y las tres palabras son distintas', () => {
    expect(sentidoDeLaDiferencia(1)).toBe('sobra');
    expect(sentidoDeLaDiferencia(-1)).toBe('falta');
    expect(sentidoDeLaDiferencia(0)).toBe('cuadra');
    expect(new Set(Object.values(PALABRA_DE_LA_DIFERENCIA)).size).toBe(3);
    expect(PALABRA_DE_LA_DIFERENCIA).toEqual({ cuadra: 'Cuadra', sobra: 'Sobra', falta: 'Falta' });
  });
});

describe('los pesos del puente, en centavos enteros', () => {
  it('cuenta dígitos y no pierde un centavo en la multiplicación', () => {
    // `19.99 * 100` da 1998.9999999999998 y `0.29 * 100`, 28.999999999999996.
    expect(aCentavos(19.99)).toBe(1999);
    expect(aCentavos(0.29)).toBe(29);
    expect(aCentavos('1989.00')).toBe(198_900);
    expect(aCentavos(-0.1)).toBe(-10);
  });

  it('lo que no es un importe no se lee como cero', () => {
    expect(aCentavos(null)).toBeNull();
    expect(aCentavos('')).toBeNull();
    expect(aCentavos(Number.NaN)).toBeNull();
  });
});

describe('el folio, como se lee en el PDF y en el aviso', () => {
  it('un corte se lee con su serie: CC-1, como dice el PDF', () => {
    expect(folioConSerie('CC', '1')).toBe('CC-1');
  });

  it('una liquidación rellena el consecutivo a seis cifras: LIQ-000001', () => {
    expect(folioConSerie('LIQ', '1', 6)).toBe('LIQ-000001');
    expect(folioConSerie('LIQ', 42, 6)).toBe('LIQ-000042');
  });

  it('un consecutivo más largo que las cifras no se recorta', () => {
    expect(folioConSerie('LIQ', '1234567', 6)).toBe('LIQ-1234567');
  });

  it('sin serie queda el número como viene', () => {
    expect(folioConSerie(null, '7')).toBe('7');
    expect(folioConSerie('  ', '7')).toBe('7');
    expect(folioConSerie(undefined, '7', 6)).toBe('000007');
  });

  it('sin consecutivo no hay folio que leer', () => {
    expect(folioConSerie('CC', null)).toBeNull();
    expect(folioConSerie('CC', undefined)).toBeNull();
    expect(folioConSerie('CC', '  ')).toBeNull();
    expect(folioConSerie('CC', {})).toBeNull();
  });
});
