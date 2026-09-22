import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { arbol, clasesDelArbol, textoLeido, textoPlano } from '../pruebas/lectura';
import { Cifra, Dinero, dineroEnTexto } from './dinero';

/**
 * EL DINERO · la pieza que más se mira, con la prueba que no tenía.
 *
 * El defecto que motivó esto: la pantalla de cobro de la tienda enseñó **$42.00**
 * por un aceite de **$42.90**. `Dinero` partía el importe en tres hermanos dentro de
 * un `inline-flex`, y lo que se LEÍA era `$`, `42` y `.90` en renglones separados.
 *
 * Cada caso se comprueba con las dos lecturas de `pruebas/lectura`: el `textContent`
 * y el texto LEÍDO. La segunda es la que habría visto el defecto; la primera sola
 * habría seguido en verde con él puesto —y eso está medido abajo—.
 */

function pintar(elemento: React.ReactElement): { plano: string; leido: string; clases: string[] } {
  const raiz = arbol(renderToStaticMarkup(elemento));
  return { plano: textoPlano(raiz), leido: textoLeido(raiz), clases: clasesDelArbol(raiz) };
}

describe('<Dinero> · lo que se lee es el importe entero', () => {
  const casos: readonly (readonly [number, string])[] = [
    [4290, '$42.90'], // EL caso: el que la pantalla enseñó como $42.00
    [4200, '$42.00'],
    [4205, '$42.05'],
    [4209, '$42.09'],
    [4299, '$42.99'],
    [5, '$0.05'],
    [0, '$0.00'],
    [123456, '$1,234.56'],
    [12345678, '$123,456.78'],
    [99999999, '$999,999.99'],
    [-4290, '($42.90)'],
    [-5, '($0.05)'],
  ];

  for (const [centavos, esperado] of casos) {
    it(`${String(centavos)} centavos → ${esperado}`, () => {
      const { plano, leido } = pintar(<Dinero centavos={centavos} />);
      expect(plano).toBe(esperado);
      expect(leido).toBe(esperado);
    });
  }

  it('sin símbolo, para una columna cuya cabecera ya dice que es dinero', () => {
    expect(pintar(<Dinero centavos={4290} sinSimbolo />).leido).toBe('42.90');
  });

  it('en todos los tamaños, incluido el total de la pantalla de cobro', () => {
    for (const tamano of ['xs', 'sm', 'base', 'lg', 'total'] as const) {
      expect(pintar(<Dinero centavos={4290} tamano={tamano} />).leido).toBe('$42.90');
    }
  });

  it('ninguna pieza del importe apila a sus hijos: ni flex ni grid', () => {
    const { clases } = pintar(<Dinero centavos={-123456} />);
    expect(clases.filter((c) => /^(inline-)?(flex|grid)$/.test(c))).toEqual([]);
  });

  it('el lector de pantalla oye el importe, sin paréntesis ni símbolos sueltos', () => {
    const marcado = renderToStaticMarkup(<Dinero centavos={-4290} />);
    expect(marcado).toContain('aria-label="menos 42 pesos con 90 centavos"');
  });

  it('medido: con el `inline-flex` de antes, textContent seguía verde y la lectura NO', () => {
    // El marcado exacto que pintaba el componente defectuoso.
    const defectuoso =
      '<span class="inline-flex items-baseline gap-px font-numeros"><span>$</span><span>42</span><span>.90</span></span>';
    const raiz = arbol(defectuoso);
    expect(textoPlano(raiz)).toBe('$42.90'); // por eso textContent no basta
    expect(textoLeido(raiz)).toBe('$\n42\n.90'); // y esto es lo que leyó la prueba
  });
});

describe('dineroEnTexto · el mismo importe, para donde no cabe un componente', () => {
  it('coincide carácter por carácter con lo que pinta <Dinero>', () => {
    for (const centavos of [4290, 0, 5, 123456, -4290]) {
      expect(dineroEnTexto(centavos)).toBe(pintar(<Dinero centavos={centavos} />).leido);
    }
  });
});

describe('<Cifra> · kilos, piezas, minutos', () => {
  it('el valor y su unidad se leen como una cosa, con su espacio', () => {
    expect(pintar(<Cifra valor={12} unidad="kg" />).leido).toBe('12 kg');
    expect(pintar(<Cifra valor={12} unidad="kg" />).plano).toBe('12 kg');
  });

  it('con decimales, miles y sin unidad', () => {
    expect(pintar(<Cifra valor={1.5} decimales={2} unidad="m" />).leido).toBe('1.50 m');
    expect(pintar(<Cifra valor={1234} />).leido).toBe('1,234');
    expect(pintar(<Cifra valor={-3} unidad="pz" />).leido).toBe('-3 pz');
  });

  it('ninguna pieza apila a sus hijos', () => {
    const { clases } = pintar(<Cifra valor={12} unidad="kg" tamano="lg" />);
    expect(clases.filter((c) => /^(inline-)?(flex|grid)$/.test(c))).toEqual([]);
  });
});
