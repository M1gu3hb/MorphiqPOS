import { describe, expect, it } from 'vitest';

import { matrizSintetica } from '../matriz-sintetica.ts';
import { renderizarQrSvg } from '../renderizar.ts';
import { problemaDeXml } from '../xml-de-prueba.ts';
import { esIdMarco, MARCOS, obtenerMarco, type IdMarco } from './catalogo.ts';
import type { OpcionesDeMarco } from './lienzo.ts';

/**
 * LOS 43 MARCOS.
 *
 * Cada diseño enmarca el QR con una etiqueta, un boleto, un sello... y le pone hasta tres textos.
 * El texto lo escribe una persona, así que sale escapado; y el QR queda entero: debajo de él sólo
 * va un panel del color del fondo.
 */

const IDS: readonly IdMarco[] = MARCOS.map((marco) => marco.id);
const VERSIONES = [2, 7] as const;

function conMarco(version: number, marco: OpcionesDeMarco, tamano = 1024): string {
  return renderizarQrSvg(matrizSintetica(version), { marco, tamano });
}

/** Un valor tal como llega de fuera: el compilador lo ve como `string`, no como el catálogo. */
const desdeFuera = (valor: string): string => valor;

/** El texto de los tspan de un SVG, ya sin las etiquetas. */
const renglones = (svg: string): string[] =>
  Array.from(
    svg.matchAll(/<tspan [^>]*>([^<]*)<\/tspan>/g),
    (coincidencia) => coincidencia[1] ?? '',
  );

describe('el catálogo de marcos', () => {
  it('son 43, con ids únicos y nombre en español', () => {
    // Arrange · Act · Assert
    expect(MARCOS).toHaveLength(43);
    expect(new Set(IDS).size).toBe(43);
    for (const marco of MARCOS) expect(marco.nombre.trim()).not.toBe('');
  });

  it('cada uno declara entre uno y tres textos, y sus etiquetas y ejemplos son tres', () => {
    // Arrange · Act · Assert
    for (const marco of MARCOS) {
      expect([1, 2, 3]).toContain(marco.textos);
      expect(marco.ejemplo).toHaveLength(3);
      expect(marco.etiquetas).toHaveLength(3);
    }
  });

  it('los editoriales llaman distinto a sus campos y los demás usan los nombres comunes', () => {
    // Arrange · Act · Assert
    expect(obtenerMarco('discover-portrait').etiquetas[0]).toBe('Llamada principal');
    expect(obtenerMarco('band').etiquetas[0]).toBe('Texto principal');
    expect(obtenerMarco('discover-landscape').textos).toBe(3);
  });

  it('esIdMarco reconoce los ids del catálogo y rechaza lo demás', () => {
    // Arrange · Act · Assert
    expect(esIdMarco('wave-gradient')).toBe(true);
    expect(esIdMarco('Band')).toBe(false);
    expect(esIdMarco('')).toBe(false);
  });
});

describe('cada marco se dibuja', () => {
  describe.each(VERSIONES)('con una matriz de la versión %i', (version) => {
    it.each(IDS)('«%s» da un SVG bien formado, con viewBox y sin números rotos', (tipo) => {
      // Arrange · Act
      const svg = conMarco(version, { tipo });

      // Assert
      expect(svg.startsWith('<svg')).toBe(true);
      expect(svg).toMatch(/viewBox="0 0 [\d.]+ [\d.]+"/);
      expect(svg).not.toMatch(/NaN|Infinity|undefined/);
      expect(problemaDeXml(svg)).toBeNull();
    });
  });

  it.each(IDS)(
    '«%s» con todos sus textos, degradado y fuente manuscrita sigue bien formado',
    (tipo) => {
      // Arrange
      const marco: OpcionesDeMarco = {
        tipo,
        texto: 'Escanéame',
        textoSecundario: 'Abre tu cámara',
        textoPie: 'morphiq.com.mx',
        degradado: true,
        fuente: 'script',
        color: '#0f172a',
        colorAcento: '#2563eb',
        colorTexto: '#fafafa',
      };

      // Act
      const svg = conMarco(7, marco);

      // Assert
      expect(problemaDeXml(svg)).toBeNull();
      expect(svg).toContain('id="frame-gradient"');
      expect(svg).toContain('font-family="cursive"');
    },
  );

  it('el QR queda entero: su cuerpo va completo, escalado a la cuadrícula del marco', () => {
    // Arrange · Act
    const svg = conMarco(2, { tipo: 'band' });

    // Assert · versión 2 con margen 1 = 27 unidades; el QR se coloca en (8, 8) de 100 → 2.16
    expect(svg).toContain('<g transform="translate(2.16 2.16)"><rect width="27" height="27"');
    expect(svg).toContain('<g transform="scale(0.27)">');
    // Assert · el panel del fondo es 2 unidades más grande que el código por cada lado
    expect(svg).toContain('<rect x="6" y="6" width="104" height="104" rx="3" fill="#ffffff"/>');
  });

  it('el alto sale de la proporción del marco', () => {
    // Arrange · Act
    const banda = conMarco(2, { tipo: 'band' }, 1000);
    const banner = conMarco(2, { tipo: 'banner-phone' }, 1000);

    // Assert · banda: 116 × 140; banner: (218 + 9) × 116
    expect(banda).toContain('width="1000" height="1207"');
    expect(banner).toContain('width="1000" height="511"');
  });

  it('un marco con un saliente a la izquierda corre el QR esa distancia', () => {
    // Arrange · Act
    const svg = conMarco(2, { tipo: 'banner-compact' });

    // Assert · x = 207 − 104 = 103 más 9 de saliente = 112 → 112 × 0.27
    expect(svg).toContain('translate(30.24 2.16)');
  });

  it('el texto vertical del marco lateral va girado', () => {
    // Arrange · Act
    const svg = conMarco(2, { tipo: 'side', texto: 'Menú' });

    // Assert
    expect(svg).toContain('rotate(-90 126 58)');
  });
});

describe('el texto del marco', () => {
  const PELIGROSO = `Café & <b>"Tacos"</b> 'Don Poncho'`;

  it('sale escapado: & < > " y \' nunca llegan crudos al documento', () => {
    // Arrange · Act
    const svg = conMarco(2, { tipo: 'band', texto: PELIGROSO });

    // Assert
    expect(renglones(svg)).toEqual([
      'Café &amp; &lt;b&gt;&quot;Tacos&quot;&lt;/b&gt; &apos;Don Poncho&apos;',
    ]);
    expect(svg).not.toContain('<b>');
    expect(problemaDeXml(svg)).toBeNull();
  });

  it.each(IDS)('en «%s» ninguno de los tres textos puede inyectar etiquetas', (tipo) => {
    // Arrange
    const inyeccion = '</text><script>alert(1)</script><text>';

    // Act
    const svg = conMarco(2, {
      tipo,
      texto: inyeccion,
      textoSecundario: inyeccion,
      textoPie: inyeccion,
    });

    // Assert
    expect(svg).not.toContain('<script');
    expect(svg).not.toContain('<text>');
    expect(svg).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(problemaDeXml(svg)).toBeNull();
  });

  it('un texto con caracteres de control prohibidos por XML no rompe el documento', () => {
    // Arrange · Act
    const svg = conMarco(2, { tipo: 'band', texto: 'Hola\u0000\u0001\u0008 mundo\u001f' });

    // Assert
    expect(renglones(svg)).toEqual(['Hola mundo']);
    expect(problemaDeXml(svg)).toBeNull();
  });

  it('se queda con 140 caracteres y no parte un emoji por la mitad', () => {
    // Arrange
    const largo = '😀'.repeat(300);

    // Act
    const [renglon] = renglones(conMarco(2, { tipo: 'band', texto: largo }));

    // Assert
    expect(Array.from(renglon ?? '')).toHaveLength(140);
    expect(renglon).toBe('😀'.repeat(140));
  });

  it('respeta el máximo de líneas del diseño y descarta las demás', () => {
    // Arrange · Act
    const dos = renglones(conMarco(2, { tipo: 'band', texto: 'a\nb\nc\nd' }));
    const tres = renglones(
      conMarco(2, {
        tipo: 'discover-portrait',
        texto: 'a\nb\nc\nd',
        textoSecundario: '',
        textoPie: '',
      }),
    );

    // Assert
    expect(dos).toEqual(['a', 'b']);
    expect(tres).toEqual(['a', 'b', 'c']);
  });

  it('un texto en blanco no dibuja nada, y sin texto se usa el de ejemplo', () => {
    // Arrange · Act
    const vacio = renglones(conMarco(2, { tipo: 'band', texto: '  \n ' }));
    const ejemplo = renglones(conMarco(2, { tipo: 'band' }));

    // Assert
    expect(vacio).toEqual([]);
    expect(ejemplo).toEqual(['Escanéame']);
  });

  it('los saltos de línea de Windows cuentan como uno', () => {
    // Arrange · Act
    const lineas = renglones(conMarco(2, { tipo: 'band', texto: 'uno\r\ndos' }));

    // Assert
    expect(lineas).toEqual(['uno', 'dos']);
  });
});

describe('lo que el marco no acepta', () => {
  it('un tipo que no es del catálogo lanza en vez de dibujar un marco cualquiera', () => {
    // Arrange · lo que llega de fuera (una base de datos) es `string`, no el catálogo
    const tipo = desdeFuera('no-existe') as IdMarco;

    // Act · Assert
    expect(() => conMarco(2, { tipo })).toThrow(/catálogo/);
  });

  it('un color que no es hexadecimal lanza: acabaría dentro de un atributo', () => {
    // Arrange · Act · Assert
    expect(() => conMarco(2, { tipo: 'band', color: '#000" onload="x' })).toThrow(RangeError);
    expect(() => conMarco(2, { tipo: 'band', colorAcento: 'blue' })).toThrow(RangeError);
    expect(() => conMarco(2, { tipo: 'band', colorTexto: 'url(#x)' })).toThrow(RangeError);
  });
});
