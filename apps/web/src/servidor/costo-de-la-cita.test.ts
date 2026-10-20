import { describe, expect, it } from 'vitest';

import { quienVeElCosto } from './costo-de-la-cita.ts';

/**
 * D.1 de la 2.4 · Qué parte del costo de la cita puede leer cada puesto.
 *
 * La estilista abría la cita en curso y la pantalla pedía la receta y la cotización, que su
 * puesto no lee: dos 403 en cada apertura. Ahora la página dice qué se puede pedir, y la
 * respuesta sale de los permisos reales de lo pedido (el mapa del puente y los roles del
 * comando), no de una lista tecleada aquí.
 */
describe('quién ve el costo de la cita', () => {
  it('quien dirige ve el material y la comisión: es el bloque que decide el precio', () => {
    for (const rol of ['dueno', 'administrador', 'gerente']) {
      expect(quienVeElCosto(rol), rol).toEqual({ material: true, comision: true });
    }
  });

  it('la cajera cotiza la cita pero no ve el costo del material', () => {
    expect(quienVeElCosto('cajero')).toEqual({ material: false, comision: true });
  });

  it('LA ESTILISTA no pide ninguna de las dos: su puesto no las lee', () => {
    // El rol de las estilistas en la base es `mesero`.
    expect(quienVeElCosto('mesero')).toEqual({ material: false, comision: false });
  });

  it('la cocina lee la receta pero no su costo: sin costo, el material no tiene precio', () => {
    expect(quienVeElCosto('cocina').material).toBe(false);
  });

  it('un rol que no existe no ve nada, en vez de verlo todo', () => {
    expect(quienVeElCosto('')).toEqual({ material: false, comision: false });
    expect(quienVeElCosto('intruso')).toEqual({ material: false, comision: false });
  });
});
