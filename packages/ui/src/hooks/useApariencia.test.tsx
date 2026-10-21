import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { useApariencia, type AparienciaInicial } from './useApariencia';

/**
 * La apariencia con que ARRANCA la interfaz, antes de que nadie toque un selector.
 *
 * El valor inicial lo escribe el servidor en el `<html>`; este hook lo vuelve estado. Si lo
 * que llega no es un estilo conocido, el hook lanzaba durante la hidratación y la aplicación
 * quedaba en blanco. Ahora arranca con el predeterminado (`morphiq`).
 */
function Sonda({ inicial }: { readonly inicial: string | AparienciaInicial }) {
  const { apariencia } = useApariencia(inicial);
  return (
    <p
      data-estilo={apariencia.estilo}
      data-densidad={apariencia.densidad}
      data-redondeo={apariencia.redondeo}
      data-elevacion={apariencia.elevacion}
      data-movimiento={apariencia.movimiento}
    />
  );
}

describe('useApariencia · el estilo inicial', () => {
  it('un estilo guardado se respeta, con las perillas de fábrica de ese estilo', () => {
    const marcado = renderToStaticMarkup(<Sonda inicial="noche" />);
    expect(marcado).toContain('data-estilo="noche"');
    expect(marcado).toContain('data-densidad="comoda"');
  });

  it('con las perillas que el negocio guardó, gana lo guardado', () => {
    const marcado = renderToStaticMarkup(
      <Sonda inicial={{ estilo: 'noche', densidad: 'compacta', movimiento: 'nula' }} />,
    );
    expect(marcado).toContain('data-estilo="noche"');
    expect(marcado).toContain('data-densidad="compacta"');
    expect(marcado).toContain('data-movimiento="nula"');
  });

  it('un estilo vacío arranca con morphiq en vez de lanzar', () => {
    const marcado = renderToStaticMarkup(<Sonda inicial="" />);
    expect(marcado).toContain('data-estilo="morphiq"');
    expect(marcado).toContain('data-densidad="normal"');
  });

  it('un estilo que ya no existe arranca con morphiq en vez de dejar la pantalla en blanco', () => {
    expect(() => renderToStaticMarkup(<Sonda inicial="premium" />)).not.toThrow();
    expect(renderToStaticMarkup(<Sonda inicial={{ estilo: 'inexistente' }} />)).toContain(
      'data-estilo="morphiq"',
    );
  });
});
