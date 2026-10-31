import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { PantallaDeCarga } from './carga-de-pantalla';

/**
 * LA CARGA LARGA (DP-11.1): cuando una pantalla entera tarda y no hay forma que esqueletar
 * (entrar con el PIN, el menú del portal). Antes era un círculo girando suelto.
 */
describe('<PantallaDeCarga>', () => {
  it('se anuncia como estado y dice qué carga', () => {
    const marcado = renderToStaticMarkup(<PantallaDeCarga titulo="Cargando tu caja" />);
    expect(marcado).toContain('role="status"');
    expect(marcado).toContain('aria-live="polite"');
    expect(marcado).toMatch(/>Cargando tu caja</);
  });

  it('no se ve antes de 600 ms: una carga corta no parpadea', () => {
    const marcado = renderToStaticMarkup(<PantallaDeCarga titulo="Cargando" />);
    expect(marcado).toContain('carga-aparece');
    expect(marcado).toContain('animation-delay:600ms');
    expect(renderToStaticMarkup(<PantallaDeCarga titulo="Cargando" retrasoMs={0} />)).toContain(
      'animation-delay:0ms',
    );
  });

  it('la tarjeta es una superficie del sistema, y la barra es decorativa', () => {
    const marcado = renderToStaticMarkup(<PantallaDeCarga titulo="Cargando" />);
    expect(marcado).toContain('data-nivel="3"');
    expect(marcado).toMatch(/aria-hidden="true"[^>]*class="[^"]*carga-riel/);
    expect(marcado).toContain('carga-barra');
  });

  it('con mascota, la pinta encima y el texto empieza debajo de sus manos', () => {
    const marcado = renderToStaticMarkup(
      <PantallaDeCarga
        titulo="Cargando las mesas"
        mascota={<span data-prueba="mascota" />}
        solapeDeLaMascota={0.1143}
      />,
    );
    expect(marcado).toContain('data-prueba="mascota"');
    expect(marcado).toContain('padding-top:calc(11.43% + var(--espacio-4))');
  });

  it('sin mascota, la tarjeta lleva su relleno normal', () => {
    const marcado = renderToStaticMarkup(<PantallaDeCarga titulo="Cargando" />);
    expect(marcado).not.toContain('padding-top:calc(');
  });

  it('`pantalla` ocupa todo y va al frente; `contenida`, el hueco de su sección', () => {
    expect(renderToStaticMarkup(<PantallaDeCarga titulo="Cargando" />)).toContain('fixed inset-0');
    const contenida = renderToStaticMarkup(
      <PantallaDeCarga titulo="Cargando" variante="contenida" />,
    );
    expect(contenida).not.toContain('fixed inset-0');
    expect(contenida).toContain('py-(--espacio-16)');
  });
});
