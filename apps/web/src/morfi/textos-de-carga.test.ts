import { describe, expect, it } from 'vitest';

import { textoDeCarga } from './textos-de-carga';

/** «Cargando tu caja», «Cargando las mesas»: la carga larga dice QUÉ carga (DP-11.1). */
describe('textoDeCarga', () => {
  it('cada puesto lee lo suyo', () => {
    expect(textoDeCarga('/caja')).toBe('Cargando tu caja');
    expect(textoDeCarga('/mesero')).toBe('Cargando las mesas');
    expect(textoDeCarga('/cocina')).toBe('Cargando la cocina');
    expect(textoDeCarga('/')).toBe('Cargando tu negocio');
    expect(textoDeCarga('/restaurante/cierre-diario-y-arqueo')).toBe('Cargando el cierre del día');
  });

  it('una subruta o una consulta no cambian lo que se dice', () => {
    expect(textoDeCarga('/caja/')).toBe('Cargando tu caja');
    expect(textoDeCarga('/configuracion?tab=mesas')).toBe('Cargando la configuración');
  });

  it('lo que no conoce dice sólo «Cargando»', () => {
    expect(textoDeCarga('/algo-nuevo')).toBe('Cargando');
    expect(textoDeCarga('')).toBe('Cargando');
  });
});
