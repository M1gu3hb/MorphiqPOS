import { describe, expect, it } from 'vitest';

import { fragmentoDeLogo, geometriaDeLogo, type ImagenLogo } from './logo.ts';
import { MAPA_DE_BITS, PNG_MINIMO, VECTOR } from './logo-de-prueba.ts';
import { matrizSintetica } from './matriz-sintetica.ts';
import { posicionesDeAlineacion } from './matriz.ts';
import { esModuloProtegido } from './protegidos.ts';
import { problemaDeXml } from './xml-de-prueba.ts';

/**
 * EL SVG DEL LOGO.
 *
 * La ventana recorta la imagen, y una máscara deja ver por encima los módulos protegidos que
 * caigan dentro. La imagen es lo único que entra de fuera, así que se revisa en la frontera: un
 * SVG con elementos activos o unos datos que no son una imagen no pasan.
 */

const MARGEN = 1;

describe('el fragmento SVG del logo', () => {
  const matriz = matrizSintetica(7);
  const posiciones = posicionesDeAlineacion(7);
  const geometria = geometriaDeLogo(matriz, MARGEN, MAPA_DE_BITS);

  /** Los módulos (x, y) de la matriz que caen dentro de la ventana. */
  const modulosDeLaVentana = (): (readonly [number, number])[] => {
    const desde = geometria.inicio - MARGEN;
    const rango = Array.from({ length: geometria.lado }, (_, i) => desde + i);
    return rango.flatMap((y) => rango.map((x) => [x, y] as const));
  };

  it('deja visible, por encima de la imagen, cada módulo protegido que caiga en la ventana', () => {
    // Arrange
    const protegidos = modulosDeLaVentana().filter(([x, y]) =>
      esModuloProtegido(matriz, x, y, posiciones),
    );

    // Act
    const fragmento = fragmentoDeLogo(matriz, MARGEN, MAPA_DE_BITS, geometria);
    const huecosDeLaMascara =
      fragmento.match(/<rect x="[\d.]+" y="[\d.]+" width="1" height="1" fill="#000"\/>/g) ?? [];

    // Assert · la versión 7 tiene un patrón de alineación en el centro: la comprobación no es vacía
    expect(protegidos.length).toBeGreaterThan(0);
    expect(huecosDeLaMascara).toHaveLength(protegidos.length);
    for (const [x, y] of protegidos) {
      expect(fragmento).toContain(
        `<rect x="${x + MARGEN}" y="${y + MARGEN}" width="1" height="1" fill="#000"/>`,
      );
    }
  });

  it('en modo weave teje el resto de los módulos de la ventana con su color de tinta o de fondo', () => {
    // Arrange
    const total = modulosDeLaVentana().length;
    const protegidos = modulosDeLaVentana().filter(([x, y]) =>
      esModuloProtegido(matriz, x, y, posiciones),
    ).length;

    // Act
    const tejido = fragmentoDeLogo(matriz, MARGEN, MAPA_DE_BITS, geometria, {
      fusion: 'weave',
      primerPlano: '#112233',
      fondo: '#eeeeee',
    });
    const integrado = fragmentoDeLogo(matriz, MARGEN, MAPA_DE_BITS, geometria, {
      fusion: 'integrated',
    });

    // Assert
    expect(tejido.match(/width="\.72"/g) ?? []).toHaveLength(total - protegidos);
    expect(integrado).not.toContain('width=".72"');
    expect(tejido).toContain('fill="#112233"');
  });

  it('recorta la imagen con una ventana del tamaño de la geometría y con la forma pedida', () => {
    // Arrange
    const redonda = geometriaDeLogo(matriz, MARGEN, MAPA_DE_BITS, { forma: 'circle' });

    // Act
    const fragmento = fragmentoDeLogo(matriz, MARGEN, MAPA_DE_BITS, redonda);

    // Assert
    expect(fragmento).toContain(
      `<clipPath id="image-window"><rect x="${redonda.inicio}" y="${redonda.inicio}" width="${redonda.lado}" height="${redonda.lado}" rx="${redonda.radio}"/>`,
    );
    expect(fragmento).toContain('clip-path="url(#image-window)" mask="url(#image-safe)"');
    expect(problemaDeXml(fragmento)).toBeNull();
  });

  it('incrusta un mapa de bits como <image> con sus datos', () => {
    // Arrange · Act
    const fragmento = fragmentoDeLogo(matriz, MARGEN, MAPA_DE_BITS, geometria);

    // Assert
    expect(fragmento).toContain(`<image `);
    expect(fragmento).toContain(`href="${PNG_MINIMO}"`);
  });

  it('incrusta un vector reescribiendo sólo la etiqueta de apertura', () => {
    // Arrange
    const g = geometriaDeLogo(matriz, MARGEN, VECTOR);

    // Act
    const fragmento = fragmentoDeLogo(matriz, MARGEN, VECTOR, g);

    // Assert · una sola x, y, width y height en la etiqueta svg; el rect interior no se toca
    const apertura = /<svg [^>]*>/.exec(fragmento)?.[0] ?? '';
    expect(apertura.match(/ width=/g)).toHaveLength(1);
    expect(apertura.match(/ height=/g)).toHaveLength(1);
    expect(apertura).toContain(' viewBox="0 0 10 10"');
    expect(fragmento).toContain('<rect width="10" height="10" fill="#f00"/>');
    expect(problemaDeXml(fragmento)).toBeNull();
  });

  it('prefiere el vector a los datos cuando vienen los dos', () => {
    // Arrange
    const ambos = { ...VECTOR, datos: PNG_MINIMO };

    // Act
    const fragmento = fragmentoDeLogo(
      matriz,
      MARGEN,
      ambos,
      geometriaDeLogo(matriz, MARGEN, ambos),
    );

    // Assert
    expect(fragmento).not.toContain('<image ');
  });
});

describe('lo que el logo no puede traer', () => {
  const matriz = matrizSintetica(5);
  const dibujar = (imagen: ImagenLogo): string =>
    fragmentoDeLogo(matriz, MARGEN, imagen, geometriaDeLogo(matriz, MARGEN, imagen));

  it('rechaza un SVG con elementos activos', () => {
    // Arrange
    const peligrosos = [
      '<svg><script>alert(1)</script></svg>',
      '<svg onload="alert(1)"></svg>',
      '<svg><foreignObject><div/></foreignObject></svg>',
      '<svg><a href="javascript:alert(1)"/></svg>',
      '<!DOCTYPE svg><svg/>',
    ];

    // Act · Assert
    for (const svg of peligrosos)
      expect(() => dibujar({ ...VECTOR, svg }), svg).toThrow(/activos|<svg>/);
  });

  it('rechaza unos datos que no son una imagen en base64', () => {
    // Arrange
    const malos = [
      'https://ejemplo.com/logo.png',
      'javascript:alert(1)',
      'data:text/html;base64,PHNjcmlwdD4=',
      'data:image/png;base64,AAAA" onload="alert(1)',
      'data:image/png,sin-base64',
    ];

    // Act · Assert
    for (const datos of malos)
      expect(() => dibujar({ ancho: 1, alto: 1, datos }), datos).toThrow(/data:image/);
  });

  it('exige svg o datos', () => {
    // Arrange · Act · Assert
    expect(() => dibujar({ ancho: 1, alto: 1 })).toThrow(/svg. o .datos/);
  });

  it('rechaza colores que no son hexadecimales: acabarían dentro de un atributo', () => {
    // Arrange
    const g = geometriaDeLogo(matriz, MARGEN, MAPA_DE_BITS);

    // Act · Assert
    expect(() => fragmentoDeLogo(matriz, MARGEN, MAPA_DE_BITS, g, { fondo: 'red" x="' })).toThrow(
      RangeError,
    );
    expect(() =>
      fragmentoDeLogo(matriz, MARGEN, MAPA_DE_BITS, g, { primerPlano: 'url(#x)' }),
    ).toThrow(RangeError);
  });
});
