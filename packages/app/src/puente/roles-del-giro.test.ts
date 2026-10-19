import { describe, expect, it } from 'vitest';

import { etiquetaDeRolEnElGiro } from './roles.ts';

/**
 * A.8 · Las estilistas de la demo de estética tienen rol `mesero` en la base y la
 * entrada las rotulaba «Mesero». El rol de quien atiende se nombra con el diccionario
 * del giro; los demás roles, igual en todos.
 */
describe('etiquetaDeRolEnElGiro', () => {
  it('quien atiende se llama como en su giro', () => {
    expect(etiquetaDeRolEnElGiro('mesero', 'estetica')).toBe('Estilista');
    expect(etiquetaDeRolEnElGiro('mesero', 'cafeteria')).toBe('Barista');
    expect(etiquetaDeRolEnElGiro('mesero', 'restaurante')).toBe('Mesero');
  });

  it('lo que el negocio personalizó manda sobre el diccionario', () => {
    expect(
      etiquetaDeRolEnElGiro('mesero', 'estetica', {
        responsable: { singular: 'colorista', plural: 'coloristas', genero: 'femenino' },
      }),
    ).toBe('Colorista');
  });

  it('los demás roles no cambian con el giro', () => {
    expect(etiquetaDeRolEnElGiro('dueno', 'estetica')).toBe('Dueño');
    expect(etiquetaDeRolEnElGiro('cocina', 'restaurante')).toBe('Cocina');
  });

  it('un giro desconocido cae a la etiqueta de siempre', () => {
    expect(etiquetaDeRolEnElGiro('mesero', '')).not.toBe('');
  });
});
