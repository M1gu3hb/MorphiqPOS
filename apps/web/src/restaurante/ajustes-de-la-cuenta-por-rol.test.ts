import { describe, expect, it } from 'vitest';

import { puedeAjustarLaCuenta } from './ajustes-de-la-cuenta-por-rol.ts';

/**
 * Día completo del restaurante (2.4) · QUIÉN VE «ANULAR» Y «DIVIDIR».
 *
 * La mesa activa los ofrecía al mesero, a quien el servidor se los niega: cada toque
 * terminaba en «Tu rol no puede hacer eso». La autorización sigue siendo del servidor; esto es
 * lo que se enseña.
 */
describe('quién ve los botones que quitan o reparten un importe', () => {
  it('la caja y la dirección sí: son los roles que el servidor deja', () => {
    expect(puedeAjustarLaCuenta('caja')).toBe(true);
    expect(puedeAjustarLaCuenta('administrador')).toBe(true);
  });

  it('el mesero NO: él comanda y pide la cuenta, no hace desaparecer dinero', () => {
    expect(puedeAjustarLaCuenta('mesero')).toBe(false);
  });

  it('cocina y almacén tampoco, y nadie sin identificar: falla cerrado', () => {
    expect(puedeAjustarLaCuenta('cocina')).toBe(false);
    expect(puedeAjustarLaCuenta('almacen')).toBe(false);
    expect(puedeAjustarLaCuenta(null)).toBe(false);
    expect(puedeAjustarLaCuenta('')).toBe(false);
  });
});
