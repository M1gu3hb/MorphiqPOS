import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { EsqueletoDeTabla, Vacio } from './estados';
import { Aviso } from './retroalimentacion';

/**
 * LOS ESTADOS, con lo que las pantallas recompuestas tuvieron que rodear a mano: la
 * barra y la cocina agrandaban el título del vacío alcanzando su `<p>` interno desde
 * fuera (`[&>p:first-of-type]:text-display`); el historial de la clienta perdió un
 * encabezado porque el título del vacío es un párrafo; un aviso de atención no podía
 * anunciarse como alerta ni callarse, y no aceptaba un `<Dinero>` en el título.
 */
describe('<Vacio> · tamaños, tono y encabezado', () => {
  it('`protagonista`: el título en el paso display, sin meterle la mano desde fuera', () => {
    const marcado = renderToStaticMarkup(
      <Vacio titulo="La fila está vacía." tamano="protagonista" tono="exito" />,
    );
    expect(marcado).toMatch(/<p class="[^"]*text-display[^"]*">La fila está vacía\.<\/p>/);
    expect(marcado).toContain('bg-exito/15');
  });

  it('`compacto`: sin el aire de una pantalla entera', () => {
    const marcado = renderToStaticMarkup(<Vacio titulo="Sin huecos." tamano="compacto" />);
    expect(marcado).toContain('py-(--espacio-6)');
    expect(marcado).not.toContain('py-(--espacio-12)');
  });

  it('con `nivelDeTitulo`, el título es un encabezado con su id', () => {
    const marcado = renderToStaticMarkup(
      <Vacio titulo="Ana viene por primera vez." nivelDeTitulo={2} idDelTitulo="primera" />,
    );
    expect(marcado).toMatch(/<h2 id="primera"[^>]*>Ana viene por primera vez\.<\/h2>/);
  });
});

describe('<Aviso> · cómo se anuncia y qué lleva', () => {
  it('peligro es alerta y lo demás estado, por omisión', () => {
    expect(renderToStaticMarkup(<Aviso tono="peligro" titulo="No se cobró." />)).toContain(
      'role="alert"',
    );
    expect(renderToStaticMarkup(<Aviso tono="atencion" titulo="Revisa." />)).toContain(
      'role="status"',
    );
  });

  it('`anuncio` lo cambia: una validación que se oye ya, una franja que no se repite', () => {
    expect(
      renderToStaticMarkup(<Aviso tono="atencion" titulo="Elige una hora." anuncio="alerta" />),
    ).toContain('role="alert"');
    const quieto = renderToStaticMarkup(
      <Aviso tono="peligro" titulo="Alergia: nuez." anuncio="ninguno" />,
    );
    expect(quieto).not.toContain('role=');
  });

  it('el título puede llevar un elemento, y el aviso su id y su icono', () => {
    const marcado = renderToStaticMarkup(
      <Aviso
        tono="exito"
        id="acuse"
        icono={<svg data-icono="" />}
        titulo={
          <>
            Cobrado · <strong>$1,800.00</strong>
          </>
        }
      />,
    );
    expect(marcado).toContain('id="acuse"');
    expect(marcado).toContain('data-icono=""');
    expect(marcado).toContain('<strong>$1,800.00</strong>');
    expect(marcado).not.toContain('✓');
  });
});

describe('<EsqueletoDeTabla>', () => {
  it('anuncia que carga y tiene la forma de columnas, sin círculo de avatar', () => {
    const marcado = renderToStaticMarkup(<EsqueletoDeTabla filas={3} columnas={4} />);
    expect(marcado).toContain('role="status"');
    expect(marcado).toContain('aria-busy="true"');
    expect(marcado).not.toContain('rounded-full');
  });
});
