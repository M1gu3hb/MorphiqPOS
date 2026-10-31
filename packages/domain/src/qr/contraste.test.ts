import { describe, expect, it } from 'vitest';

import { esColorHex, exigirColor, luminancia, tieneColoresLegibles } from './contraste.ts';
import { disenoLegible } from './degradados.ts';

/**
 * ¿SE VA A PODER LEER?
 *
 * Un QR bonito que no escanea es peor que uno feo. La regla: la tinta (módulos y ojos) tiene que
 * ser más oscura que el fondo y contrastar al menos 4.5 a 1.
 */

describe('tieneColoresLegibles', () => {
  it('acepta negro sobre blanco y un azul profundo con ojos negros', () => {
    // Arrange · Act · Assert
    expect(tieneColoresLegibles('#000000', '#000000', '#ffffff')).toBe(true);
    expect(tieneColoresLegibles('#0044aa', '#000000', '#ffffff')).toBe(true);
  });

  it('rechaza ojos demasiado claros aunque los módulos se lean', () => {
    // Arrange · Act · Assert
    expect(tieneColoresLegibles('#000000', '#eeeeee', '#ffffff')).toBe(false);
  });

  it('rechaza el QR invertido: tinta clara sobre fondo oscuro', () => {
    // Arrange · Act · Assert
    expect(tieneColoresLegibles('#ffffff', '#ffffff', '#000000')).toBe(false);
    expect(tieneColoresLegibles('#f0f0f0', '#f0f0f0', '#101010')).toBe(false);
  });

  it('rechaza el contraste justo por debajo de 4.5 y acepta el justo por encima', () => {
    // Arrange · el gris más claro que pasa AA sobre blanco es #767676 (4.54); #777777 da 4.48.

    // Act · Assert
    expect(tieneColoresLegibles('#767676', '#767676', '#ffffff')).toBe(true);
    expect(tieneColoresLegibles('#777777', '#777777', '#ffffff')).toBe(false);
  });

  it('rechaza tinta y fondo iguales', () => {
    // Arrange · Act · Assert
    expect(tieneColoresLegibles('#336699', '#336699', '#336699')).toBe(false);
  });

  it('entiende los colores de tres dígitos', () => {
    // Arrange · Act · Assert
    expect(tieneColoresLegibles('#000', '#000', '#fff')).toBe(true);
    expect(luminancia('#fff')).toBeCloseTo(1, 10);
    expect(luminancia('#abc')).toBeCloseTo(luminancia('#aabbcc'), 10);
  });
});

describe('disenoLegible', () => {
  const base = { primerPlano: '#000000', ojos: '#000000', fondo: '#ffffff' };

  it('sin degradado, vale lo mismo que los colores lisos', () => {
    // Arrange · Act · Assert
    expect(disenoLegible(base)).toBe(true);
    expect(disenoLegible({ ...base, ojos: '#eeeeee' })).toBe(false);
  });

  it('con degradado, el segundo color también tiene que leerse', () => {
    // Arrange
    const legible = { modo: 'linear', color: '#123ca3', angulo: 45 } as const;
    const claro = { modo: 'linear', color: '#f5f5f5', angulo: 45 } as const;

    // Act · Assert
    expect(disenoLegible({ ...base, degradado: legible })).toBe(true);
    expect(disenoLegible({ ...base, degradado: claro })).toBe(false);
  });

  it('un degradado en modo none no cuenta, aunque su color sea ilegible', () => {
    // Arrange
    const apagado = { modo: 'none', color: '#f5f5f5', angulo: 0 } as const;

    // Act · Assert
    expect(disenoLegible({ ...base, degradado: apagado })).toBe(true);
  });
});

describe('los colores que pueden entrar a un atributo del SVG', () => {
  it('sólo se aceptan hexadecimales de tres o seis dígitos', () => {
    // Arrange · Act · Assert
    for (const bueno of ['#000', '#FFF', '#a1B2c3', '#123ca3'])
      expect(esColorHex(bueno)).toBe(true);
    for (const malo of ['red', '#12', '#1234', '#ggg', '000000', '#00000000', '', ' #000']) {
      expect(esColorHex(malo)).toBe(false);
    }
  });

  it('un color con una comilla dentro no pasa: cerraría el atributo', () => {
    // Arrange
    const inyeccion = '#000" onload="alert(1)';

    // Act · Assert
    expect(esColorHex(inyeccion)).toBe(false);
    expect(() => exigirColor(inyeccion, 'El fondo')).toThrow(RangeError);
    expect(() => exigirColor(inyeccion, 'El fondo')).toThrow(/El fondo/);
  });

  it('exigirColor devuelve el mismo color cuando es válido', () => {
    // Arrange · Act · Assert
    expect(exigirColor('#0044aa', 'La tinta')).toBe('#0044aa');
  });

  it('calcular la luminancia de algo que no es un color lanza en vez de dar NaN', () => {
    // Arrange · Act · Assert
    expect(() => luminancia('azul')).toThrow(RangeError);
  });
});
