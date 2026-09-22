import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { CampoDeDinero, centavosDeTexto, textoParaCampo } from './campo-de-dinero';

/**
 * EL CAMPO DONDE SE TECLEA DINERO. La pantalla habla en centavos; el texto lo lleva el
 * campo. Las dos conversiones son las que cada pantalla escribía a su manera, y ninguna
 * puede pasar por coma flotante.
 */
describe('centavosDeTexto · lo tecleado, en centavos', () => {
  const casos: readonly (readonly [string, number | null])[] = [
    ['42.90', 4290],
    ['42.9', 4290],
    ['42', 4200],
    ['42.', 4200],
    ['0.05', 5],
    ['1,234.50', 123450],
    ['$58', 5800],
    ['  7.5 ', 750],
    ['', null],
    ['abc', null],
    ['42.999', null],
    ['-5', null],
    ['1.2.3', null],
  ];
  for (const [texto, centavos] of casos) {
    it(`«${texto}» → ${String(centavos)}`, () => {
      expect(centavosDeTexto(texto)).toBe(centavos);
    });
  }
});

describe('textoParaCampo · centavos, para el valor de un campo', () => {
  it('con sus dos decimales, sin símbolo y sin separador de miles', () => {
    expect(textoParaCampo(4290)).toBe('42.90');
    expect(textoParaCampo(5)).toBe('0.05');
    expect(textoParaCampo(123450)).toBe('1234.50');
    expect(textoParaCampo(-5)).toBe('-0.05');
    expect(textoParaCampo(null)).toBe('');
  });

  it('ida y vuelta sin perder un centavo, en todo el rango de un ticket', () => {
    for (let centavos = 0; centavos <= 200_000; centavos += 137) {
      expect(centavosDeTexto(textoParaCampo(centavos))).toBe(centavos);
    }
  });
});

describe('<CampoDeDinero>', () => {
  it('pinta el importe que le llega, como texto de campo y en cifras tabulares', () => {
    const marcado = renderToStaticMarkup(
      <CampoDeDinero
        id="recibido"
        aria-label="Recibí"
        centavos={4290}
        alCambiar={() => undefined}
      />,
    );
    expect(marcado).toContain('value="42.90"');
    expect(marcado).toContain('id="recibido"');
    expect(marcado).toContain('inputMode="decimal"');
    expect(marcado).toContain('tabular-nums');
  });

  it('vacío cuando todavía no hay importe', () => {
    const marcado = renderToStaticMarkup(
      <CampoDeDinero aria-label="Fondo" centavos={null} alCambiar={() => undefined} />,
    );
    expect(marcado).toContain('value=""');
  });
});
