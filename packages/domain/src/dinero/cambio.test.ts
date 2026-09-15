import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import { dentroDelTope, redondearCambio } from './cambio.ts';

/**
 * F-257 · El cálculo del redondeo de cambio.
 *
 * $47.30 de ticket, $50 de billete, $2.70 de cambio y ni una moneda de veinte
 * centavos. Lo que se prueba aquí es que las dos salidas —quedarse los veinte o
 * poner los treinta— se calculen igual de bien, porque elegir siempre la misma
 * es una comisión silenciosa o un regalo silencioso.
 */

describe('redondearCambio', () => {
  it('HACIA EL NEGOCIO: se entrega lo que cabe en monedas', () => {
    const cambio = redondearCambio(270n, 50n, false);

    expect(cambio.entregadoCentavos).toBe(250n);
    expect(cambio.residuoCentavos).toBe(20n);
    expect(cambio.tipo).toBe('a_favor');
  });

  it('HACIA EL CLIENTE: se entrega la moneda completa', () => {
    // El negocio pone los treinta centavos que faltan para los tres pesos.
    const cambio = redondearCambio(270n, 50n, true);

    expect(cambio.entregadoCentavos).toBe(300n);
    expect(cambio.residuoCentavos).toBe(-30n);
    expect(cambio.tipo).toBe('en_contra');
  });

  it('LAS DOS DIRECCIONES SUMAN EL MISMO CAMBIO', () => {
    // Entregado más residuo es siempre lo que se debía. Si no, el corte no
    // cuadra por la diferencia y no hay renglón que lo diga.
    for (const haciaElCliente of [true, false]) {
      const cambio = redondearCambio(270n, 50n, haciaElCliente);
      expect(cambio.entregadoCentavos + cambio.residuoCentavos).toBe(270n);
    }
  });

  it('EL CAMBIO EXACTO NO DEJA RENGLÓN', () => {
    // Un tipo aquí haría que el corte llevara un renglón de cero por cada venta
    // que cuadra, que son casi todas.
    const cambio = redondearCambio(250n, 50n, false);

    expect(cambio.residuoCentavos).toBe(0n);
    expect(cambio.tipo).toBeNull();
    expect(cambio.entregadoCentavos).toBe(250n);
  });

  it('CON MONEDA DE UN PESO el residuo puede ser de noventa y nueve', () => {
    const cambio = redondearCambio(299n, 100n, false);

    expect(cambio.entregadoCentavos).toBe(200n);
    expect(cambio.residuoCentavos).toBe(99n);
  });

  it('un cambio negativo es un cobro incompleto', () => {
    expect(codigoDe(() => redondearCambio(-100n, 50n, false))).toBe('CONFIGURACION_INVALIDA');
  });

  it('una moneda mínima de cero no divide nada', () => {
    expect(codigoDe(() => redondearCambio(270n, 0n, false))).toBe('CONFIGURACION_INVALIDA');
  });
});

describe('dentroDelTope', () => {
  it('UN PESO SÍ, UN PESO CON UNO NO', () => {
    // Por encima del peso deja de ser un redondeo y es un descuento sin
    // autorizar con otro nombre.
    expect(dentroDelTope(100n)).toBe(true);
    expect(dentroDelTope(101n)).toBe(false);
    expect(dentroDelTope(5_000n)).toBe(false);
  });

  it('EL TOPE VALE EN LOS DOS SENTIDOS', () => {
    // Regalar $50 «redondeando» es tan descuento como quedárselos.
    expect(dentroDelTope(-100n)).toBe(true);
    expect(dentroDelTope(-101n)).toBe(false);
  });

  it('cero no es un redondeo', () => {
    expect(dentroDelTope(0n)).toBe(false);
  });
});

function codigoDe(fn: () => unknown): string {
  try {
    fn();
    return 'NO LANZÓ';
  } catch (error) {
    return esErrorDominio(error) ? error.codigo : `INESPERADO: ${String(error)}`;
  }
}
