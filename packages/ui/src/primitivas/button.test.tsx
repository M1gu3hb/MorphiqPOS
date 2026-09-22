import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Button } from './button';

/**
 * `<Button asChild>` · el botón que mataba media aplicación.
 *
 * `Slot` exige UN SOLO hijo elemento. Con la rueda de «cargando» escrita junto a
 * `children` —`{cargando ? <Rueda/> : null}{children}`— un `<Button asChild>` le
 * pasaba DOS, `null` y el enlace, y la página entera moría al pintarse. `asChild`
 * está en cada estado vacío y en cada atajo, así que eran media aplicación en 500.
 *
 * Su único guardián fue la galería, que no corría en CI. Ésta sí corre.
 */
describe('<Button asChild>', () => {
  it('se pinta como el elemento que se le da, con las clases del botón', () => {
    const marcado = renderToStaticMarkup(
      <Button asChild>
        <a href="/caja">Abrir la caja</a>
      </Button>,
    );
    expect(marcado.startsWith('<a ')).toBe(true);
    expect(marcado).toContain('href="/caja"');
    expect(marcado).toContain('data-slot="button"');
    expect(marcado).toContain('>Abrir la caja</a>');
  });

  it('con `cargando` puesto sigue pintándose: la rueda no se cuela junto al Slot', () => {
    expect(() =>
      renderToStaticMarkup(
        <Button asChild cargando>
          <a href="/caja">Abrir la caja</a>
        </Button>,
      ),
    ).not.toThrow();
  });

  it('sin `asChild`, cargando deshabilita, lo anuncia y pinta la rueda', () => {
    const marcado = renderToStaticMarkup(<Button cargando>Cobrar</Button>);
    expect(marcado.startsWith('<button ')).toBe(true);
    expect(marcado).toContain('disabled=""');
    expect(marcado).toContain('aria-busy="true"');
    expect(marcado).toContain('animate-spin');
  });
});
