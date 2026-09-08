import { ErrorDominio } from '@morphiqpos/contracts/errores';
import { describe, expect, it } from 'vitest';
import { centavos } from '../dinero';
import {
  cantidad,
  cantidadATexto,
  convertirUnidad,
  precioDeLinea,
  calcularMlPorPorcion,
} from './index';

describe('CAT-02 · equivalencias y contenedor', () => {
  it('deriva 46.875 ml exactos y da prioridad a los ml explícitos', () => {
    expect(
      cantidadATexto(calcularMlPorPorcion({ capacidadMl: '750', porcionesPorContenedor: '16' })),
    ).toBe('46.875');
    expect(
      cantidadATexto(
        calcularMlPorPorcion({
          capacidadMl: '750',
          porcionesPorContenedor: '16',
          mlPorPorcion: '45',
        }),
      ),
    ).toBe('45');
    expect(() => calcularMlPorPorcion({ capacidadMl: '750' })).toThrow(ErrorDominio);
  });
  it('cobra porciones cuya medida se deriva del contenedor', () => {
    expect(
      precioDeLinea(
        {
          tipoVenta: 'porcion_contenedor',
          precioCentavos: centavos(8500),
          capacidadMl: '750',
          porcionesPorContenedor: '16',
        },
        { cantidad: '2', unidad: 'porcion' },
      ).subtotalCentavos,
    ).toBe(17000n);
  });

  it('requiere medida explícita o una división exacta del contenedor', () => {
    for (const porciones of ['0', '7']) {
      expect(() =>
        precioDeLinea(
          {
            tipoVenta: 'porcion_contenedor',
            precioCentavos: centavos(8500),
            capacidadMl: '750',
            porcionesPorContenedor: porciones,
          },
          { cantidad: '1', unidad: 'porcion' },
        ),
      ).toThrow(ErrorDominio);
    }
  });

  it('convierte cajas con equivalencia explícita del catálogo', () => {
    expect(cantidadATexto(convertirUnidad(cantidad('3'), 'caja', 'pieza', '24'))).toBe('72');
    expect(cantidadATexto(convertirUnidad(cantidad('2'), 'paquete', 'g', '250'))).toBe('500');
  });

  it('no usa equivalencias cero ni corrige dimensiones estándar incompatibles', () => {
    expect(() => convertirUnidad(cantidad('3'), 'caja', 'pieza', '0')).toThrow(ErrorDominio);
    expect(() => convertirUnidad(cantidad('3'), 'kg', 'l', '1')).toThrow(ErrorDominio);
  });
});
