import { describe, expect, it } from 'vitest';

import { claseDePlatillo } from './historial-clases.ts';
import {
  diaDeInstante,
  diaDeLaSemana,
  esDiaValido,
  instanteLocal,
  minutosDe,
  sumarDias,
  ventanaDeDias,
} from './historial-fechas.ts';

/**
 * Los días y las horas del historial viven en la hora de Ciudad de México, y el servidor que los
 * calcula corre en UTC. Todo el historial depende de que una venta de las 22:30 sea del día en
 * que se vendió, no del siguiente.
 */

describe('historial-fechas', () => {
  it('reconoce días que existen y rechaza los que no', () => {
    expect(esDiaValido('2026-10-20')).toBe(true);
    expect(esDiaValido('2028-02-29')).toBe(true);
    expect(esDiaValido('2026-02-29')).toBe(false);
    expect(esDiaValido('2026-13-01')).toBe(false);
    expect(esDiaValido('20-10-2026')).toBe(false);
    expect(esDiaValido('')).toBe(false);
  });

  it('suma y resta días cruzando mes y año', () => {
    expect(sumarDias('2026-10-31', 1)).toBe('2026-11-01');
    expect(sumarDias('2026-01-01', -1)).toBe('2025-12-31');
    expect(sumarDias('2028-02-28', 1)).toBe('2028-02-29');
    expect(sumarDias('2026-10-20', 0)).toBe('2026-10-20');
  });

  it('la ventana va del día más viejo al más reciente y termina en el día dado', () => {
    expect(ventanaDeDias('2026-10-20', 3)).toEqual(['2026-10-18', '2026-10-19', '2026-10-20']);
    expect(ventanaDeDias('2026-03-02', 4)).toEqual([
      '2026-02-27',
      '2026-02-28',
      '2026-03-01',
      '2026-03-02',
    ]);
    expect(ventanaDeDias('2026-10-20', 30)).toHaveLength(30);
  });

  it('el día de la semana es el del calendario, no el de la zona del servidor', () => {
    expect(diaDeLaSemana('2026-10-18')).toBe(0);
    expect(diaDeLaSemana('2026-10-19')).toBe(1);
    expect(diaDeLaSemana('2026-10-24')).toBe(6);
  });

  it('las 13:00 de México son las 19:00 UTC del mismo día', () => {
    expect(instanteLocal('2026-10-20', minutosDe(13)).toISOString()).toBe(
      '2026-10-20T19:00:00.000Z',
    );
  });

  it('las 22:30 de México ya son del día siguiente en UTC, pero siguen siendo del mismo día local', () => {
    const noche = instanteLocal('2026-10-20', minutosDe(22, 30));
    expect(noche.toISOString()).toBe('2026-10-21T04:30:00.000Z');
    expect(diaDeInstante(noche)).toBe('2026-10-20');
  });

  it('la medianoche local es el inicio del día y un minuto antes es del día anterior', () => {
    const inicio = instanteLocal('2026-10-20', 0);
    expect(diaDeInstante(inicio)).toBe('2026-10-20');
    expect(diaDeInstante(new Date(inicio.getTime() - 60_000))).toBe('2026-10-19');
  });

  it('respeta una zona con horario de verano si se le pide (el desfase sale de Intl, no de una constante)', () => {
    const invierno = instanteLocal('2026-01-15', minutosDe(12), 'America/New_York');
    const verano = instanteLocal('2026-07-15', minutosDe(12), 'America/New_York');
    expect(invierno.toISOString()).toBe('2026-01-15T17:00:00.000Z');
    expect(verano.toISOString()).toBe('2026-07-15T16:00:00.000Z');
  });

  it('hacer la ida y la vuelta devuelve el mismo día local para toda hora del día', () => {
    for (let minutos = 0; minutos < 24 * 60; minutos += 37) {
      const instante = instanteLocal('2026-10-20', minutos);
      expect(diaDeInstante(instante)).toBe('2026-10-20');
    }
  });
});

describe('claseDePlatillo', () => {
  const clase = claseDePlatillo;

  it('deduce la clase del nombre de la categoría, con o sin acentos', () => {
    expect(clase('Entradas', 'cocina')).toBe('entrada');
    expect(clase('Platos fuertes', 'cocina')).toBe('principal');
    expect(clase('Tacos', 'cocina')).toBe('principal');
    expect(clase('Postres', 'cocina')).toBe('postre');
    expect(clase('Bebidas', 'barra')).toBe('bebida');
    expect(clase('Cervezas', 'barra')).toBe('bebida');
    expect(clase('CAFÉ', 'barra')).toBe('bebida');
  });

  it('sin categoría, decide el área: lo de la barra se bebe', () => {
    expect(clase(null, 'barra')).toBe('bebida');
    expect(clase(null, 'cocina')).toBe('principal');
    expect(clase('Especialidades', 'barra')).toBe('bebida');
  });
});
