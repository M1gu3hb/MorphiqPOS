import { ErrorDominio } from '@morphiqpos/contracts/errores';
import { describe, expect, it } from 'vitest';

import { centavos } from '../dinero/index.ts';
import { precioDeLinea, resolverTipoVenta } from './index.ts';

const fijo = {
  tipoVenta: 'precio_fijo',
  unidadVenta: 'pieza',
  precioCentavos: centavos(2350),
} as const;
const variable = {
  tipoVenta: 'variable_medida',
  unidadVariable: 'kg',
  precioCentavos: centavos(18990),
  minimo: '0.1',
  maximo: '5',
  incremento: '0.05',
} as const;
const porcion = {
  tipoVenta: 'porcion_contenedor',
  precioCentavos: centavos(9500),
  capacidadMl: '750',
  mlPorPorcion: '45',
} as const;

describe('CAT-01/02 · precio de catálogo', () => {
  it.each(['precio_fijo', 'variable_medida', 'porcion_contenedor', 'servicio'])(
    'reconoce %s sin sustituciones silenciosas',
    (tipo) => {
      expect(resolverTipoVenta(tipo)).toBe(tipo);
    },
  );

  it('rechaza tipos ausentes o desconocidos', () => {
    expect(() => resolverTipoVenta(undefined)).toThrow(ErrorDominio);
    expect(() => resolverTipoVenta('variable')).toThrow(ErrorDominio);
  });

  it('cobra tres piezas con el precio del catálogo', () => {
    expect(precioDeLinea(fijo, { cantidad: '3', unidad: 'pieza' })).toEqual({
      subtotalCentavos: 7050n,
      precioUnitarioCentavos: 2350n,
      esMayoreo: false,
    });
  });

  it('convierte 250 gramos antes de cobrar el precio por kilogramo', () => {
    expect(precioDeLinea(variable, { cantidad: '250', unidad: 'g' }).subtotalCentavos).toBe(4748n);
  });

  it('redondea medio centavo una sola vez al cerrar la línea', () => {
    expect(
      precioDeLinea(
        { ...variable, precioCentavos: centavos(201) },
        { cantidad: '0.5', unidad: 'kg' },
      ).subtotalCentavos,
    ).toBe(101n);
  });

  it('no pierde enteros grandes al calcular dinero', () => {
    expect(
      precioDeLinea(
        { ...fijo, precioCentavos: centavos(9007199254740993n) },
        { cantidad: '3', unidad: 'pieza' },
      ).subtotalCentavos,
    ).toBe(27021597764222979n);
  });

  it('cobra dos porciones con su precio propio', () => {
    expect(precioDeLinea(porcion, { cantidad: '2', unidad: 'porcion' }).subtotalCentavos).toBe(
      19000n,
    );
  });

  it('cobra un servicio por unidad configurada', () => {
    expect(
      precioDeLinea({ ...fijo, tipoVenta: 'servicio' }, { cantidad: '1', unidad: 'pieza' })
        .subtotalCentavos,
    ).toBe(2350n);
  });

  it('permite precio cero configurado explícitamente', () => {
    expect(
      precioDeLinea({ ...fijo, precioCentavos: centavos(0) }, { cantidad: '1', unidad: 'pieza' })
        .subtotalCentavos,
    ).toBe(0n);
  });

  it('aplica mayoreo desde el umbral, con interruptor explícito del servidor', () => {
    const producto = { ...fijo, mayoreo: { minimo: '6', precioCentavos: centavos(2100) } };
    expect(precioDeLinea(producto, { cantidad: '5', unidad: 'pieza' }, true).esMayoreo).toBe(false);
    expect(precioDeLinea(producto, { cantidad: '6', unidad: 'pieza' }, true)).toEqual({
      subtotalCentavos: 12600n,
      precioUnitarioCentavos: 2100n,
      esMayoreo: true,
    });
    expect(
      precioDeLinea(producto, { cantidad: '6', unidad: 'pieza' }, false).subtotalCentavos,
    ).toBe(14100n);
  });

  it.each(['0', '-1', '0.5', 'NaN', '1.00001'])('rechaza piezas inválidas %s', (cantidad) => {
    expect(() => precioDeLinea(fijo, { cantidad, unidad: 'pieza' })).toThrow(ErrorDominio);
  });

  it.each(['0.05', '5.05', '0.12'])('respeta mínimo, máximo e incremento: %s', (cantidad) => {
    expect(() => precioDeLinea(variable, { cantidad, unidad: 'kg' })).toThrow(ErrorDominio);
  });

  it('admite cantidades fraccionarias de productos fijos medidos en metros', () => {
    expect(
      precioDeLinea({ ...fijo, unidadVenta: 'm' }, { cantidad: '1.5', unidad: 'm' })
        .subtotalCentavos,
    ).toBe(3525n);
  });

  it('rechaza unidades incompatibles, porciones fraccionarias y precio negativo', () => {
    expect(() => precioDeLinea(variable, { cantidad: '1', unidad: 'l' })).toThrow(ErrorDominio);
    expect(() => precioDeLinea(porcion, { cantidad: '0.5', unidad: 'porcion' })).toThrow(
      ErrorDominio,
    );
    expect(() => precioDeLinea(porcion, { cantidad: '1', unidad: 'ml' })).toThrow(ErrorDominio);
    expect(() =>
      precioDeLinea({ ...fijo, precioCentavos: centavos(-1) }, { cantidad: '1', unidad: 'pieza' }),
    ).toThrow(ErrorDominio);
  });

  it('rechaza configuraciones incoherentes aunque la cantidad de venta sea válida', () => {
    expect(() =>
      precioDeLinea({ ...variable, minimo: '6' }, { cantidad: '1', unidad: 'kg' }),
    ).toThrow(ErrorDominio);
    expect(() =>
      precioDeLinea({ ...variable, incremento: '0' }, { cantidad: '1', unidad: 'kg' }),
    ).toThrow(ErrorDominio);
    expect(() =>
      precioDeLinea({ ...porcion, mlPorPorcion: '800' }, { cantidad: '1', unidad: 'porcion' }),
    ).toThrow(ErrorDominio);
    expect(() =>
      precioDeLinea(
        { ...fijo, mayoreo: { minimo: '0', precioCentavos: centavos(1) } },
        { cantidad: '1', unidad: 'pieza' },
      ),
    ).toThrow(ErrorDominio);
  });
});
