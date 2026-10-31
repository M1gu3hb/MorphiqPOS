import { describe, expect, it } from 'vitest';

import { formatearNumero, poligono, rectangulo, rutaSvg, trasladar, type Ruta } from './ruta.ts';
import { escaparXml, limpiarTexto } from './xml.ts';

/**
 * LAS PIEZAS DE LA GEOMETRÍA Y EL TEXTO QUE ENTRA AL SVG.
 */

describe('formatearNumero', () => {
  it('recorta a cuatro decimales y quita los ceros de sobra', () => {
    // Arrange · Act · Assert
    expect(formatearNumero(1)).toBe('1');
    expect(formatearNumero(0.5)).toBe('0.5');
    expect(formatearNumero(1 / 3)).toBe('0.3333');
    expect(formatearNumero(2.00004)).toBe('2');
  });

  it('no escribe notación científica ni -0', () => {
    // Arrange · Act · Assert
    expect(formatearNumero(8.27e-16)).toBe('0');
    expect(formatearNumero(-0.00001)).toBe('0');
  });
});

describe('rectangulo', () => {
  it('sin radio es un polígono de cuatro vértices', () => {
    // Arrange · Act
    const ruta = rectangulo(1, 2, 3, 4);

    // Assert
    expect(rutaSvg(ruta)).toBe('M1 2L4 2L4 6L1 6Z');
  });

  it('con radio añade una curva por esquina redondeada', () => {
    // Arrange · Act
    const redondo = rectangulo(0, 0, 1, 1, 0.25);
    const unaEsquina = rectangulo(0, 0, 1, 1, [0.25, 0, 0, 0]);

    // Assert
    expect(redondo.filter((comando) => comando[0] === 'C')).toHaveLength(4);
    expect(unaEsquina.filter((comando) => comando[0] === 'C')).toHaveLength(4);
    expect(rutaSvg(redondo)).not.toBe(rutaSvg(rectangulo(0, 0, 1, 1)));
  });

  it('un radio mayor que la mitad del lado se recorta a la mitad: da un círculo, no una figura rota', () => {
    // Arrange · Act
    const enorme = rectangulo(0, 0, 2, 2, 50);
    const justo = rectangulo(0, 0, 2, 2, 1);

    // Assert
    expect(rutaSvg(enorme)).toBe(rutaSvg(justo));
  });
});

describe('poligono', () => {
  it('escala los vértices de proporción a la caja', () => {
    // Arrange · Act
    const triangulo = poligono(10, 20, 4, 2, [
      [0.5, 0],
      [1, 1],
      [0, 1],
    ]);

    // Assert
    expect(rutaSvg(triangulo)).toBe('M12 20L14 22L10 22Z');
  });
});

describe('trasladar', () => {
  it('desplaza todos los puntos y deja la ruta original como estaba', () => {
    // Arrange
    const original: Ruta = rectangulo(0, 0, 1, 1, 0.3);
    const antes = rutaSvg(original);

    // Act
    const movida = trasladar(original, 5, 7);

    // Assert
    expect(rutaSvg(original)).toBe(antes);
    expect(movida).not.toBe(original);
    expect(rutaSvg(movida)).toBe(rutaSvg(rectangulo(5, 7, 1, 1, 0.3)));
  });
});

describe('escaparXml', () => {
  it('escapa los cinco caracteres con significado en XML', () => {
    // Arrange · Act · Assert
    expect(escaparXml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&apos;');
  });

  it('escapa el & primero: no vuelve a escapar lo que acaba de escapar', () => {
    // Arrange · Act · Assert
    expect(escaparXml('a & b < c')).toBe('a &amp; b &lt; c');
    expect(escaparXml('&amp;')).toBe('&amp;amp;');
  });

  it('deja en paz el texto normal, con acentos y emojis', () => {
    // Arrange · Act · Assert
    expect(escaparXml('Café señor 😀 100%')).toBe('Café señor 😀 100%');
  });
});

describe('limpiarTexto', () => {
  it('quita los caracteres de control que XML prohíbe y conserva tabulador y salto de línea', () => {
    // Arrange · Act · Assert
    expect(limpiarTexto('a\u0000b\u0007c\td\ne', 100)).toBe('abc\td\ne');
  });

  it('cuenta caracteres, no unidades UTF-16', () => {
    // Arrange · Act · Assert
    expect(limpiarTexto('😀😀😀', 2)).toBe('😀😀');
  });

  it('unifica los saltos de línea de Windows y de Mac antiguo', () => {
    // Arrange · Act · Assert
    expect(limpiarTexto('a\r\nb\rc', 100)).toBe('a\nb\nc');
  });
});
