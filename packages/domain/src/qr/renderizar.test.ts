import { describe, expect, it } from 'vitest';

import {
  ESTILOS_DE_CENTRO,
  ESTILOS_DE_MODULO,
  ESTILOS_DE_OJO,
  PRESETS,
  type IdEstiloCentro,
  type IdEstiloModulo,
  type IdEstiloOjo,
} from './catalogo.ts';
import { PNG_MINIMO } from './logo-de-prueba.ts';
import { matrizSintetica } from './matriz-sintetica.ts';
import type { OpcionesQr } from './opciones.ts';
import { renderizarQrSvg } from './renderizar.ts';
import { problemaDeXml } from './xml-de-prueba.ts';

/**
 * DE LA MATRIZ AL SVG.
 *
 * El contrato de salida: un SVG bien formado que empieza con `<svg`, trae `viewBox`, no tiene
 * números rotos y es siempre el mismo para las mismas entradas. Cada módulo, ojo y centro del
 * catálogo tiene que poder dibujarse con una matriz chica (versión 2) y con una de alineaciones
 * múltiples (versión 7).
 */

const VERSIONES = [2, 7] as const;
const LADO_SIN_MARGEN = { 2: 25, 7: 45 } as const;

/** Un valor tal como llega de fuera: el compilador lo ve como `string`, no como el catálogo. */
const desdeFuera = (valor: string): string => valor;

function afirmarSvgValido(svg: string): void {
  expect(svg.startsWith('<svg')).toBe(true);
  expect(svg).toMatch(/viewBox="0 0 [\d.]+ [\d.]+"/);
  expect(svg.endsWith('</svg>')).toBe(true);
  expect(svg).not.toMatch(/NaN|Infinity|undefined/);
  expect(problemaDeXml(svg)).toBeNull();
}

describe.each(VERSIONES)('renderizarQrSvg con una matriz de la versión %i', (version) => {
  const matriz = matrizSintetica(version);

  it.each(ESTILOS_DE_MODULO.map((estilo) => estilo.id))('módulo «%s»', (modulo) => {
    // Arrange · Act
    const svg = renderizarQrSvg(matriz, { modulo });

    // Assert
    afirmarSvgValido(svg);
  });

  it.each(ESTILOS_DE_OJO.map((estilo) => estilo.id))(
    'ojo «%s» con cada uno de los centros',
    (ojo) => {
      // Arrange · Act · Assert
      for (const centro of ESTILOS_DE_CENTRO)
        afirmarSvgValido(renderizarQrSvg(matriz, { ojo, centro: centro.id }));
    },
  );

  it.each(ESTILOS_DE_CENTRO.map((estilo) => estilo.id))('centro «%s»', (centro) => {
    // Arrange · Act
    const svg = renderizarQrSvg(matriz, { centro });

    // Assert
    afirmarSvgValido(svg);
  });

  it('los 32 presets', () => {
    // Arrange · Act · Assert
    for (const preset of PRESETS) {
      const svg = renderizarQrSvg(matriz, {
        modulo: preset.modulo,
        ojo: preset.ojo,
        centro: preset.centro,
      });
      afirmarSvgValido(svg);
    }
  });

  it('todo junto: estilo, colores, degradado, logo y marco', () => {
    // Arrange
    const opciones: OpcionesQr = {
      margen: 4,
      primerPlano: '#08254c',
      ojos: '#000000',
      fondo: '#f7fbf8',
      tamano: 512,
      modulo: 'liquid',
      ojo: 'circle',
      centro: 'circle',
      degradado: { modo: 'radial', color: '#123ca3', angulo: 0 },
      logo: {
        imagen: { ancho: 20, alto: 10, datos: PNG_MINIMO },
        forma: 'circle',
        fusion: 'weave',
        fondo: '#ffffff',
      },
      marco: { tipo: 'bubble-bottom', texto: 'Escanéame', color: '#123ca3' },
    };

    // Act
    const svg = renderizarQrSvg(matriz, opciones);

    // Assert
    afirmarSvgValido(svg);
    expect(svg).toContain('<image ');
    expect(svg).toContain('id="qr-ink"');
  });
});

describe('el SVG de salida', () => {
  const matriz = matrizSintetica(2);

  it('sin opciones: cuadrado de 1024 px, margen 1 y negro sobre blanco', () => {
    // Arrange · Act
    const svg = renderizarQrSvg(matriz);

    // Assert
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('width="1024" height="1024" viewBox="0 0 27 27"');
    expect(svg).toContain('<rect width="27" height="27" fill="#ffffff"/>');
    expect(svg).toContain('fill="#000000"');
  });

  it.each(VERSIONES)('el viewBox es el lado de la versión %i más los dos márgenes', (version) => {
    // Arrange
    const lado = LADO_SIN_MARGEN[version];

    // Act · Assert
    for (const margen of [0, 1, 4, 8]) {
      const lado2 = lado + 2 * margen;
      expect(renderizarQrSvg(matrizSintetica(version), { margen })).toContain(
        `viewBox="0 0 ${lado2} ${lado2}"`,
      );
    }
  });

  it('el tamaño pedido va en width y height', () => {
    // Arrange · Act
    const svg = renderizarQrSvg(matriz, { tamano: 300 });

    // Assert
    expect(svg).toContain('width="300" height="300"');
  });

  it('es determinista: las mismas entradas dan exactamente el mismo texto', () => {
    // Arrange
    const opciones: OpcionesQr = { modulo: 'organic', ojo: 'leaf', centro: 'leaf' };

    // Act
    const uno = renderizarQrSvg(matrizSintetica(7), opciones);
    const otro = renderizarQrSvg(matrizSintetica(7), opciones);

    // Assert
    expect(otro).toBe(uno);
  });

  it('no cambia con el estilo lo que no es del estilo: dos QR con distinta matriz difieren', () => {
    // Arrange · Act
    const a = renderizarQrSvg(matrizSintetica(2, 1));
    const b = renderizarQrSvg(matrizSintetica(2, 2));

    // Assert
    expect(a).not.toBe(b);
  });

  it('los ojos llevan el color de los ojos; los huecos, el del fondo', () => {
    // Arrange · Act
    const svg = renderizarQrSvg(matriz, {
      primerPlano: '#112233',
      ojos: '#aa0000',
      fondo: '#fefefe',
    });

    // Assert · 3 anillos + 3 centros con el color de los ojos; 3 huecos + el fondo con el del fondo
    expect(svg.split('fill="#aa0000"')).toHaveLength(1 + 6);
    expect(svg.split('fill="#fefefe"')).toHaveLength(1 + 4);
    expect(svg.split('fill="#112233"')).toHaveLength(1 + 1);
  });

  it('los ojos toman por omisión el color de los módulos', () => {
    // Arrange · Act
    const svg = renderizarQrSvg(matriz, { primerPlano: '#112233' });

    // Assert
    expect(svg.split('fill="#112233"')).toHaveLength(1 + 7);
  });

  it('con logo, la ventana va después del código; sin logo, no hay ventana', () => {
    // Arrange
    const logo = { imagen: { ancho: 1, alto: 1, datos: PNG_MINIMO } };

    // Act
    const con = renderizarQrSvg(matriz, { logo });
    const sin = renderizarQrSvg(matriz);

    // Assert
    expect(con.indexOf('image-window')).toBeGreaterThan(con.lastIndexOf('<path'));
    expect(sin).not.toContain('image-window');
  });

  it('con marco, el SVG de salida es el del marco y lleva dentro el código completo', () => {
    // Arrange · Act
    const sinMarco = renderizarQrSvg(matriz);
    const conMarco = renderizarQrSvg(matriz, { marco: { tipo: 'outline' } });
    const cuerpo = sinMarco.slice(sinMarco.indexOf('>') + 1, sinMarco.lastIndexOf('</svg>'));

    // Assert
    expect(conMarco).toContain(cuerpo);
    expect(conMarco).not.toBe(sinMarco);
  });
});

describe('lo que renderizarQrSvg no acepta', () => {
  const matriz = matrizSintetica(2);

  it('un color que no sea hexadecimal, en cualquiera de los lugares donde entra', () => {
    // Arrange
    const malo = '#000" onload="alert(1)';
    const casos: readonly OpcionesQr[] = [
      { primerPlano: malo },
      { fondo: malo },
      { ojos: malo },
      { degradado: { modo: 'linear', color: malo, angulo: 0 } },
      { logo: { imagen: { ancho: 1, alto: 1, datos: PNG_MINIMO }, fondo: malo } },
    ];

    // Act · Assert
    for (const opciones of casos)
      expect(() => renderizarQrSvg(matriz, opciones)).toThrow(RangeError);
  });

  it('un margen o un tamaño que no sean enteros en rango', () => {
    // Arrange · Act · Assert
    for (const margen of [-1, 1.5, 33, Number.NaN]) {
      expect(() => renderizarQrSvg(matriz, { margen }), `margen ${margen}`).toThrow(/margen/i);
    }
    for (const tamano of [0, 15, 100.5, 20000, Number.NaN]) {
      expect(() => renderizarQrSvg(matriz, { tamano }), `tamaño ${tamano}`).toThrow(/tamaño/i);
    }
  });

  it('un id de estilo que no es del catálogo', () => {
    // Arrange · lo que llega de fuera (un diseño guardado, un formulario) es `string`, no el catálogo
    const modulo = desdeFuera('diamond') as IdEstiloModulo;
    const ojo = desdeFuera('heart') as IdEstiloOjo;
    const centro = desdeFuera('outpoint') as IdEstiloCentro;

    // Act · Assert
    expect(() => renderizarQrSvg(matriz, { modulo })).toThrow(/estilo de módulo/);
    expect(() => renderizarQrSvg(matriz, { ojo })).toThrow(/estilo de ojo/);
    expect(() => renderizarQrSvg(matriz, { centro })).toThrow(/estilo de centro/);
  });

  it('un degradado con un modo o un ángulo imposibles', () => {
    // Arrange
    const modo = desdeFuera('conico') as 'linear';

    // Act · Assert
    expect(() =>
      renderizarQrSvg(matriz, { degradado: { modo, color: '#000000', angulo: 0 } }),
    ).toThrow(/modo/);
    expect(() =>
      renderizarQrSvg(matriz, {
        degradado: { modo: 'linear', color: '#000000', angulo: Number.NaN },
      }),
    ).toThrow(/ángulo/);
  });
});
