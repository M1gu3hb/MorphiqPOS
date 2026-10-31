import { describe, expect, it } from 'vitest';

import { prefijarIds } from './ids-unicos.ts';
import { PNG_MINIMO } from './logo-de-prueba.ts';
import { matrizSintetica } from './matriz-sintetica.ts';
import { renderizarQrSvg } from './renderizar.ts';
import { idsDe, problemaDeXml } from './xml-de-prueba.ts';

/**
 * VARIOS QR EN UNA PÁGINA.
 *
 * Un SVG en línea comparte el espacio de ids con la página entera. Dos QR con degradado traen los
 * dos `id="qr-ink"`, y el segundo se pintaría con el degradado del primero.
 */

/** Un QR con TODO lo que define ids: degradado, logo con ventana y máscara, y marco con degradado. */
function qrCompleto(colorDelDegradado: string): string {
  return renderizarQrSvg(matrizSintetica(7), {
    degradado: { modo: 'radial', color: colorDelDegradado, angulo: 0 },
    logo: { imagen: { ancho: 10, alto: 10, datos: PNG_MINIMO } },
    marco: { tipo: 'wave-gradient', degradado: true },
  });
}

describe('prefijarIds', () => {
  it('sin prefijo, dos QR comparten ids; con prefijo, los ids de uno y otro no se cruzan', () => {
    // Arrange
    const a = qrCompleto('#c2410c');
    const b = qrCompleto('#15803d');

    // Act
    const idsA = new Set(idsDe(prefijarIds(a, 'a')));
    const idsB = new Set(idsDe(prefijarIds(b, 'b')));

    // Assert
    const sinPrefijo = idsDe(a).filter((id) => idsDe(b).includes(id));
    expect(sinPrefijo.length).toBeGreaterThan(0);
    expect(idsA.size).toBeGreaterThan(0);
    expect([...idsA].filter((id) => idsB.has(id))).toEqual([]);
  });

  it('el QR completo trae degradado, ventana del logo, máscara y degradado del marco', () => {
    // Arrange · Act
    const ids = idsDe(qrCompleto('#c2410c'));

    // Assert
    expect(ids).toEqual(
      expect.arrayContaining(['qr-ink', 'image-window', 'image-safe', 'frame-gradient']),
    );
  });

  it('las referencias url(#...) siguen al id que apuntan', () => {
    // Arrange
    const svg = qrCompleto('#c2410c');

    // Act
    const nuevo = prefijarIds(svg, 'dos');

    // Assert
    for (const id of ['qr-ink', 'image-window', 'image-safe', 'frame-gradient']) {
      expect(nuevo).toContain(`id="dos-${id}"`);
      expect(nuevo).toContain(`url(#dos-${id})`);
      expect(nuevo).not.toContain(`url(#${id})`);
    }
    expect(problemaDeXml(nuevo)).toBeNull();
  });

  it('deja en paz una referencia a un id que el marcado no define', () => {
    // Arrange
    const marcado = '<svg><rect fill="url(#externo)"/><g id="mio"/><use stroke="url(#mio)"/></svg>';

    // Act
    const nuevo = prefijarIds(marcado, 'p');

    // Assert
    expect(nuevo).toContain('fill="url(#externo)"');
    expect(nuevo).toContain('id="p-mio"');
    expect(nuevo).toContain('stroke="url(#p-mio)"');
  });

  it('no toca atributos que sólo terminan en id, como data-id', () => {
    // Arrange
    const marcado = '<svg><g data-id="x" id="y"/></svg>';

    // Act
    const nuevo = prefijarIds(marcado, 'p');

    // Assert
    expect(nuevo).toBe('<svg><g data-id="x" id="p-y"/></svg>');
  });

  it('un id cuyo nombre ya parece prefijado no se cruza con otro (una sola pasada)', () => {
    // Arrange
    const marcado = '<svg><g id="a-x"/><g id="x"/><path fill="url(#x)"/></svg>';

    // Act
    const nuevo = prefijarIds(marcado, 'a');

    // Assert
    expect(idsDe(nuevo)).toEqual(['a-a-x', 'a-x']);
    expect(nuevo).toContain('url(#a-x)');
  });

  it('un marcado sin ids queda igual', () => {
    // Arrange
    const marcado = '<svg><rect width="1" height="1"/></svg>';

    // Act · Assert
    expect(prefijarIds(marcado, 'p')).toBe(marcado);
  });

  it('rechaza un prefijo que no sirve para un id', () => {
    // Arrange · Act · Assert
    for (const malo of ['', '1abc', 'a b', 'a"b', 'a#b', '-a']) {
      expect(() => prefijarIds('<svg/>', malo), malo).toThrow(RangeError);
    }
    expect(() => prefijarIds('<svg/>', 'vista_previa-2')).not.toThrow();
  });
});
