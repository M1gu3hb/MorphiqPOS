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

/**
 * LA FILA QUE SE TOCA. En la recomposición, listas de `<button>` —clientes, huecos de la
 * agenda, cuentas por cobrar— pasaron a filas de `Tabla` con `alActivar`, y la revisión
 * adversarial encontró lo que perdieron: la fila elegida se marcaba SÓLO con color, la
 * acción principal de la caja del restaurante —cobrar una cuenta— no tenía nombre, y una
 * fila de tabla densa medía 37 px donde el giro pide un objetivo táctil de 44 a 56.
 */
describe('<Tabla> · la fila que se toca', () => {
  const activable = renderToStaticMarkup(
    <Tabla
      columnas={COLUMNAS}
      filas={FILAS}
      claveDe={(p) => p.id}
      activa="b"
      alActivar={() => undefined}
      etiquetaDeFila={(p) => `Abrir ${p.nombre}`}
    />,
  );

  it('la elegida lo dice sin color: `aria-current` y seminegritas', () => {
    expect(activable).toMatch(/<tr(?=[^>]*aria-current="true")(?=[^>]*font-semibold)[^>]*>/);
    expect(activable.match(/aria-current="true"/g)).toHaveLength(1);
  });

  it('tiene nombre: el que le da la pantalla', () => {
    expect(activable).toContain('aria-label="Abrir Frijol"');
    expect(activable).toContain('aria-label="Abrir Arroz"');
  });

  it('cada celda de una fila que se toca mide al menos el área táctil mínima', () => {
    expect(activable).toMatch(/<td[^>]*class="[^"]*(?<!min-)h-\(--area-tactil-minima\)/);
  });

  it('una tabla que sólo informa no gana nada de eso', () => {
    const informativa = renderToStaticMarkup(
      <Tabla columnas={COLUMNAS} filas={FILAS} claveDe={(p) => p.id} />,
    );
    expect(informativa).not.toContain('aria-current');
    expect(informativa).not.toMatch(/<td[^>]*class="[^"]*(?<!min-)h-\(--area-tactil-minima\)/);
  });
});
