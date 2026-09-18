import { describe, expect, it } from 'vitest';

import { esTransicionDeEsperaValida, estimarEspera } from './espera.ts';

/**
 * F-306 · La espera que se calcula en vez de inventarse.
 *
 * Lo que vigilan estas pruebas es que el número NUNCA salga de la nada: sin
 * dato de rotación contesta «no lo sé», y con mesa libre contesta cero. Un
 * sistema que inventa diez minutos es el papelito del atril con más pasos.
 */

const SALON = { medianaMinutos: 50, gruposDelante: 0, mesasCompatibles: 4, mesasLibres: 0 };

describe('F-306 · cuánto falta', () => {
  it('con mesa libre compatible, cero: se sienta ya', () => {
    expect(estimarEspera({ ...SALON, mesasLibres: 2 })).toBe(0);
  });

  it('primero de la cola con el salón lleno: una mesa', () => {
    expect(estimarEspera(SALON)).toBe(50);
  });

  it('cuatro grupos delante y cuatro mesas compatibles: sigue siendo una tanda', () => {
    expect(estimarEspera({ ...SALON, gruposDelante: 3 })).toBe(50);
  });

  it('el quinto ya espera DOS tandas', () => {
    expect(estimarEspera({ ...SALON, gruposDelante: 4 })).toBe(100);
  });

  it('las mesas libres descuentan de la cola', () => {
    // Cuatro delante, dos mesas libres: dos se sientan ya y quedan dos en cola,
    // que caben en la siguiente tanda.
    expect(estimarEspera({ ...SALON, gruposDelante: 4, mesasLibres: 2 })).toBe(50);
  });

  it('SIN DATO DE ROTACIÓN no inventa: contesta «no lo sé»', () => {
    // Un negocio recién instalado. Decirle «15 minutos» a la primera familia
    // sería una promesa sin nada detrás.
    expect(estimarEspera({ ...SALON, medianaMinutos: 0 })).toBeNull();
  });

  it('SIN MESA COMPATIBLE tampoco inventa: un grupo de doce en un salón de mesas de cuatro', () => {
    expect(estimarEspera({ ...SALON, mesasCompatibles: 0 })).toBeNull();
  });

  it('la espera crece con la cola y nunca baja', () => {
    let anterior = -1;
    for (let delante = 0; delante <= 30; delante += 1) {
      const minutos = estimarEspera({ ...SALON, gruposDelante: delante }) ?? 0;
      expect(minutos, `${delante} delante`).toBeGreaterThanOrEqual(anterior);
      anterior = minutos;
    }
  });
});

describe('F-306 · a dónde puede ir una espera', () => {
  it('de esperando se puede avisar, sentar o abandonar', () => {
    expect(esTransicionDeEsperaValida('esperando', 'avisado')).toBe(true);
    expect(esTransicionDeEsperaValida('esperando', 'sentado')).toBe(true);
    expect(esTransicionDeEsperaValida('esperando', 'abandono')).toBe(true);
  });

  it('SE PUEDE SENTAR SIN AVISAR: están de pie junto al atril', () => {
    expect(esTransicionDeEsperaValida('esperando', 'sentado')).toBe(true);
  });

  it('sentado y abandono son TERMINALES: volver a la cola sería inventar', () => {
    for (const desde of ['sentado', 'abandono']) {
      for (const hasta of ['esperando', 'avisado', 'sentado', 'abandono']) {
        expect(esTransicionDeEsperaValida(desde, hasta), `${desde} → ${hasta}`).toBe(false);
      }
    }
  });

  it('no se retrocede de avisado a esperando', () => {
    expect(esTransicionDeEsperaValida('avisado', 'esperando')).toBe(false);
  });

  it('un estado que no existe no abre ninguna puerta', () => {
    expect(esTransicionDeEsperaValida('inventado', 'sentado')).toBe(false);
  });
});
