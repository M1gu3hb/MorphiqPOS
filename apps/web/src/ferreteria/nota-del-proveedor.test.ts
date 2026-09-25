import { describe, expect, it } from 'vitest';

import { celdasDe, centavosDeTexto, leerNotaDelProveedor } from './nota-del-proveedor.ts';

describe('la nota del proveedor, leída de su archivo', () => {
  it('lee el CSV de Excel en español: punto y coma, coma decimal y BOM', () => {
    const texto =
      '\uFEFFClave;Descripción;Cantidad;Costo unitario\r\n' +
      'TOR-14;"Tornillo 1/4 x 2 galv";100;1,50\r\n' +
      'CAB-12;Cable THW cal. 12;12,5;$ 1.234,56\r\n';
    expect(leerNotaDelProveedor(texto)).toEqual({
      renglones: [
        {
          claveProveedor: 'TOR-14',
          codigoBarras: null,
          descripcion: 'Tornillo 1/4 x 2 galv',
          cantidad: '100',
          costoUnitarioCentavos: 150,
        },
        {
          claveProveedor: 'CAB-12',
          codigoBarras: null,
          descripcion: 'Cable THW cal. 12',
          cantidad: '12.5',
          costoUnitarioCentavos: 123_456,
        },
      ],
      filasConProblema: [],
      faltaColumna: null,
    });
  });

  it('reconoce las columnas por su nombre, en cualquier orden, con o sin acento', () => {
    const texto = 'PRECIO,Codigo de barras,CANT,Producto\n12.00,7501111111111,3,Tuerca 1/4\n';
    expect(leerNotaDelProveedor(texto).renglones).toEqual([
      {
        claveProveedor: null,
        codigoBarras: '7501111111111',
        descripcion: 'Tuerca 1/4',
        cantidad: '3',
        costoUnitarioCentavos: 1_200,
      },
    ]);
  });

  it('un renglón que no se entiende no se inventa: se dice cuál fue', () => {
    const texto = [
      'Descripción,Cantidad,Costo',
      'Taquete 1/4,50,0.80',
      ',10,1.00',
      'Broca 3/8,cero,25.00',
      'Lija 120,-2,5.00',
      'Codo 1/2,4,',
    ].join('\n');
    const leida = leerNotaDelProveedor(texto);
    expect(leida.renglones.map((r) => r.descripcion)).toEqual(['Taquete 1/4']);
    expect(leida.filasConProblema).toEqual([3, 4, 5, 6]);
  });

  it('sin la columna del costo no lee nada, y dice cuál falta', () => {
    expect(leerNotaDelProveedor('Descripción,Cantidad\nTaquete,5\n')).toEqual({
      renglones: [],
      filasConProblema: [],
      faltaColumna: 'costo unitario',
    });
    expect(leerNotaDelProveedor('').faltaColumna).toBe('descripción');
  });

  it('las comillas protegen el separador y se escapan dobladas', () => {
    expect(celdasDe('"Tubo 1/2"", 6 m",3,"1,200.00"', ',')).toEqual([
      'Tubo 1/2", 6 m',
      '3',
      '1,200.00',
    ]);
  });
});

describe('el importe, a centavos exactos', () => {
  it('con punto o coma decimal, y con miles', () => {
    expect(centavosDeTexto('1,234.50')).toBe(123_450);
    expect(centavosDeTexto('1.234,50')).toBe(123_450);
    expect(centavosDeTexto('$ 18')).toBe(1_800);
    expect(centavosDeTexto('0.5')).toBe(50);
  });

  it('el medio centavo se redondea hacia arriba, sin flotantes', () => {
    // `1234.995 * 100` da 123499.4999…: multiplicar perdería el centavo.
    expect(centavosDeTexto('1234.995')).toBe(123_500);
    expect(centavosDeTexto('0.994')).toBe(99);
  });

  it('lo que no es un importe es nulo', () => {
    expect(centavosDeTexto('')).toBeNull();
    expect(centavosDeTexto('doce')).toBeNull();
    expect(centavosDeTexto('-5.00')).toBeNull();
  });
});
