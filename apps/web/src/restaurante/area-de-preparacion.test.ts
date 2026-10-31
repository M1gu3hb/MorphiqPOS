import { describe, expect, it } from 'vitest';

import { AREAS_DE_PREPARACION } from '@morphiqpos/domain/catalogo';

import { areaInicial, opcionesDeArea, SEGUN_SU_CATEGORIA } from './area-de-preparacion.ts';

/**
 * DP-9.1 · EL CAMPO «ÁREA DE PREPARACIÓN» de Recetas y Platillos.
 *
 * Al editar, el campo empieza en el área que el platillo YA tiene: nunca una fija. Al crear, por
 * omisión «según su categoría»: no se manda, y el servidor la aprende.
 */
describe('el área que muestra y guarda el formulario', () => {
  it('al crear, empieza en «según su categoría», que no es un área que la columna acepte', () => {
    expect(areaInicial(null)).toBe(SEGUN_SU_CATEGORIA);
    // Por eso los diálogos no la mandan: el servidor la aprende de su categoría.
    expect(AREAS_DE_PREPARACION as readonly string[]).not.toContain(SEGUN_SU_CATEGORIA);
  });

  it('al editar, empieza en la que tiene el platillo', () => {
    expect(areaInicial({ area_preparacion: 'barra' })).toBe('barra');
    expect(areaInicial({ area_preparacion: 'ninguno' })).toBe('ninguno');
  });

  it('un área que la columna no conoce no se inventa: se lee como «sin comanda»', () => {
    expect(areaInicial({ area_preparacion: 'otra' })).toBe('ninguno');
    expect(areaInicial({ area_preparacion: null })).toBe('ninguno');
  });

  it('«según su categoría» sólo se ofrece al crear', () => {
    const alCrear = opcionesDeArea(true).map((o) => o.valor);
    const alEditar = opcionesDeArea(false).map((o) => o.valor);
    expect(alCrear[0]).toBe(SEGUN_SU_CATEGORIA);
    expect(alEditar).not.toContain(SEGUN_SU_CATEGORIA);
    expect(alEditar).toEqual(['cocina', 'barra', 'ambos', 'ninguno']);
  });

  it('cada opción tiene un nombre para la persona, no la clave de la columna', () => {
    for (const opcion of opcionesDeArea(true)) {
      expect(opcion.etiqueta).not.toBe(opcion.valor);
      expect(opcion.etiqueta.length).toBeGreaterThan(3);
    }
  });
});
