import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Tabla, type ColumnaDeTabla } from './tabla';

interface Producto {
  readonly id: string;
  readonly nombre: string;
  readonly hay: number;
}

const COLUMNAS: readonly ColumnaDeTabla<Producto>[] = [
  { clave: 'nombre', titulo: 'Producto', celda: (p) => p.nombre, orden: (p) => p.nombre },
  { clave: 'hay', titulo: 'Hay', numerica: true, celda: (p) => p.hay },
];

const FILAS: readonly Producto[] = [
  { id: 'a', nombre: 'Arroz', hay: 4 },
  { id: 'b', nombre: 'Frijol', hay: 9 },
];

/**
 * LA CABECERA QUE SE PUEDE ORDENAR. El rastreador midió la marca de «se puede ordenar»
 * —un triángulo al 30 % de opacidad— en 1.64:1 sobre el fondo de `bloque`: una pista que
 * no se ve no le dice a nadie que la columna se ordena. Estas pruebas fijan que la marca
 * va a opacidad plena, que sólo la llevan las columnas que de verdad se ordenan, y que el
 * lector de pantalla no la lee como texto.
 */
describe('<Tabla> · la marca de «se puede ordenar»', () => {
  const marcado = renderToStaticMarkup(
    <Tabla columnas={COLUMNAS} filas={FILAS} claveDe={(p) => p.id} etiqueta="Productos" />,
  );

  it('es un icono a opacidad plena, no un triángulo desvanecido', () => {
    expect(marcado).toContain('lucide-chevrons-up-down');
    expect(marcado).not.toContain('opacity-30');
    expect(marcado).not.toMatch(/[▴▾]/);
  });

  it('sólo la lleva la columna que tiene con qué ordenarse', () => {
    expect(marcado.match(/lucide-chevrons-up-down/g)).toHaveLength(1);
  });

  it('no la lee un lector de pantalla: el orden lo dice `aria-sort`', () => {
    expect(marcado).toMatch(
      /<svg(?=[^>]*aria-hidden="true")(?=[^>]*lucide-chevrons-up-down)[^>]*>/,
    );
  });
});
