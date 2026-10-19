import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ListaDeTarjetas } from './lista-de-tarjetas';
import type { ColumnaDeTabla } from './tabla';

interface Cliente {
  readonly id: string;
  readonly nombre: string;
  readonly debe: number;
}

const COLUMNAS: readonly ColumnaDeTabla<Cliente>[] = [
  { clave: 'nombre', titulo: 'Cliente', celda: (c) => c.nombre },
  { clave: 'debe', titulo: 'Debe', numerica: true, celda: (c) => c.debe },
];

const FILAS: readonly Cliente[] = [
  { id: 'a', nombre: 'Ana', debe: 120 },
  { id: 'b', nombre: 'Beto', debe: 0 },
];

/**
 * LA MISMA LISTA EN EL TELÉFONO. `TablaAdaptable` pinta estas tarjetas por debajo de su
 * ancho, y hasta ahora les pasaba sólo columnas, filas y `alActivar`: en el teléfono la
 * elegida no se marcaba, el tinte de una fila en peligro se perdía, la fila no viajaba
 * al panel y el total del pie desaparecía. Cinco pantallas lo rodeaban por su cuenta.
 */
describe('<ListaDeTarjetas> · lo que la tabla dice, dicho también en tarjetas', () => {
  const marcado = renderToStaticMarkup(
    <ListaDeTarjetas
      columnas={COLUMNAS}
      filas={FILAS}
      claveDe={(c) => c.id}
      principal="nombre"
      alActivar={() => undefined}
      activa="a"
      tonoDeFila={(c) => (c.debe > 0 ? 'peligro' : undefined)}
      viajeDeFila={(c) => (c.id === 'a' ? 'fila-a' : undefined)}
      etiquetaDeFila={(c) => `Abrir a ${c.nombre}`}
      columnasDeTarjeta="adaptable"
      pie={{ debe: 'Total $120' }}
    />,
  );

  it('la elegida lleva `aria-current` y la marca de activa de la superficie', () => {
    expect(marcado).toMatch(/<button(?=[^>]*aria-current="true")(?=[^>]*data-activa)[^>]*>/);
    expect(marcado.match(/aria-current="true"/g)).toHaveLength(1);
  });

  it('el tono de la fila tiñe la tarjeta', () => {
    expect(marcado).toContain('bg-peligro/5');
  });

  it('la tarjeta viaja con el nombre que da la pantalla', () => {
    expect(marcado).toContain('view-transition-name:fila-a');
  });

  it('tiene nombre, y sus pares van en una columna en el teléfono', () => {
    expect(marcado).toContain('aria-label="Abrir a Ana"');
    expect(marcado).toContain('grid-cols-1 sm:grid-cols-2');
  });

  it('el pie de la tabla se pinta debajo, con el título de su columna', () => {
    expect(marcado).toContain('Total $120');
    expect(marcado).toMatch(/<dt[^>]*>Debe<\/dt>/);
  });
});
