import { describe, expect, it } from 'vitest';

import {
  centrosCompatibles,
  ESTILOS_DE_CENTRO,
  ESTILOS_DE_MODULO,
  ESTILOS_DE_OJO,
  esIdEstiloCentro,
  esIdEstiloModulo,
  esIdEstiloOjo,
  PRESETS,
} from './catalogo.ts';

/**
 * EL CATÁLOGO: QUÉ FORMAS HAY.
 *
 * Los ids son la clave estable que se guarda en un diseño; los nombres son lo que se enseña. Si
 * un id se repite o un preset apunta a algo que no existe, un diseño guardado se rompe al abrirlo.
 */

describe('el catálogo de formas', () => {
  it('trae 18 módulos, 9 ojos, 7 centros y 32 presets', () => {
    // Arrange · Act · Assert
    expect(ESTILOS_DE_MODULO).toHaveLength(18);
    expect(ESTILOS_DE_OJO).toHaveLength(9);
    expect(ESTILOS_DE_CENTRO).toHaveLength(7);
    expect(PRESETS).toHaveLength(32);
  });

  it('ningún id se repite dentro de su lista', () => {
    // Arrange
    const listas = [ESTILOS_DE_MODULO, ESTILOS_DE_OJO, ESTILOS_DE_CENTRO, PRESETS];

    // Act · Assert
    for (const lista of listas) {
      expect(new Set(lista.map((elemento) => elemento.id)).size).toBe(lista.length);
    }
  });

  it('todo tiene un nombre para enseñar', () => {
    // Arrange
    const todos = [...ESTILOS_DE_MODULO, ...ESTILOS_DE_OJO, ...ESTILOS_DE_CENTRO, ...PRESETS];

    // Act · Assert
    for (const elemento of todos) expect(elemento.nombre.trim()).not.toBe('');
  });

  it('cada preset usa un módulo, un ojo y un centro que existen, y su familia es la del módulo', () => {
    // Arrange · Act · Assert
    for (const preset of PRESETS) {
      expect(esIdEstiloModulo(preset.modulo)).toBe(true);
      expect(esIdEstiloOjo(preset.ojo)).toBe(true);
      expect(esIdEstiloCentro(preset.centro)).toBe(true);
      const modulo = ESTILOS_DE_MODULO.find((estilo) => estilo.id === preset.modulo);
      expect(preset.familia).toBe(modulo?.familia);
    }
  });

  it('el centro de cada preset es compatible con su ojo', () => {
    // Arrange · Act · Assert
    for (const preset of PRESETS) {
      expect(centrosCompatibles(preset.ojo), preset.id).toContain(preset.centro);
    }
  });

  it('todo ojo tiene al menos un centro compatible, y todos son centros que existen', () => {
    // Arrange · Act · Assert
    for (const ojo of ESTILOS_DE_OJO) {
      const centros = centrosCompatibles(ojo.id);
      expect(centros.length).toBeGreaterThan(0);
      for (const centro of centros) expect(esIdEstiloCentro(centro)).toBe(true);
    }
  });

  it('las guardas rechazan lo que no es del catálogo', () => {
    // Arrange · Act · Assert
    expect(esIdEstiloModulo('diamond')).toBe(false);
    expect(esIdEstiloModulo('')).toBe(false);
    expect(esIdEstiloOjo('inpoint')).toBe(true);
    expect(esIdEstiloOjo('heart')).toBe(false);
    expect(esIdEstiloCentro('outpoint')).toBe(false);
  });
});
