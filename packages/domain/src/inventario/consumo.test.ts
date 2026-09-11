import { ErrorDominio } from '@morphiqpos/contracts/errores';
import { describe, expect, it } from 'vitest';

import { calcularConsumo, type LineaParaConsumo } from './consumo.ts';

const contexto = {
  organizacionId: 'org-a',
  almacenId: 'almacen-a',
  ordenId: 'orden-a',
  empleadoId: 'empleo-a',
  cantidad: '2',
  permiteVentaSinStock: false,
} as const;

describe('INV-01 · consumo planeado', () => {
  it('descuenta el insumo espejo de un SKU en su unidad base', () => {
    const movimientos = calcularConsumo([
      {
        ...contexto,
        lineaId: 'linea-sku',
        estrategiaConsumo: 'sku',
        insumoId: 'insumo-sku',
        unidadVenta: 'kg',
        unidadBase: 'g',
      },
    ]);

    expect(movimientos).toEqual([
      {
        organizacionId: 'org-a',
        almacenId: 'almacen-a',
        insumoId: 'insumo-sku',
        tipo: 'salida_venta',
        cantidad: '2000',
        unidad: 'g',
        permiteNegativo: false,
        referenciaTipo: 'orden',
        referenciaId: 'orden-a',
        empleadoId: 'empleo-a',
        idempotencyKey: 'inventario:orden-a:insumo-sku',
        origenes: ['linea-sku'],
      },
    ]);
  });

  it('multiplica la receta por la cantidad vendida y aplica merma exacta', () => {
    const movimientos = calcularConsumo([
      {
        ...contexto,
        lineaId: 'linea-receta',
        estrategiaConsumo: 'receta',
        receta: [
          {
            insumoId: 'harina',
            cantidad: '0.125',
            unidad: 'kg',
            unidadBase: 'g',
          },
          {
            insumoId: 'aceite',
            cantidad: '30',
            unidad: 'ml',
            unidadBase: 'ml',
            mermaPorcentaje: '10',
          },
        ],
      },
    ]);

    expect(
      movimientos.map(({ insumoId, cantidad, unidad }) => ({ insumoId, cantidad, unidad })),
    ).toEqual([
      { insumoId: 'harina', cantidad: '250', unidad: 'g' },
      { insumoId: 'aceite', cantidad: '66', unidad: 'ml' },
    ]);
  });

  it('descuenta la cantidad variable convertida a la unidad base', () => {
    const [movimiento] = calcularConsumo([
      {
        ...contexto,
        lineaId: 'linea-peso',
        estrategiaConsumo: 'insumo_base',
        insumoId: 'jamon',
        unidadBase: 'g',
        captura: { tipoVenta: 'variable_medida', cantidad: '1.25', unidad: 'kg' },
      },
    ]);

    expect(movimiento?.cantidad).toBe('1250');
    expect(movimiento?.unidad).toBe('g');
  });

  it('usa los ml calculados por porción y respeta la medida explícita', () => {
    const derivados = calcularConsumo([
      {
        ...contexto,
        lineaId: 'linea-copas',
        estrategiaConsumo: 'insumo_base',
        insumoId: 'vino',
        unidadBase: 'ml',
        captura: {
          tipoVenta: 'porcion_contenedor',
          cantidadPorciones: '3',
          capacidadMl: '750',
          porcionesPorContenedor: '16',
        },
      },
    ]);
    const explicitos = calcularConsumo([
      {
        ...contexto,
        lineaId: 'linea-shots',
        estrategiaConsumo: 'insumo_base',
        insumoId: 'tequila',
        unidadBase: 'ml',
        captura: {
          tipoVenta: 'porcion_contenedor',
          cantidadPorciones: '2',
          capacidadMl: '750',
          mlPorPorcion: '45',
          porcionesPorContenedor: '16',
        },
      },
    ]);

    expect(derivados[0]?.cantidad).toBe('140.625');
    expect(explicitos[0]?.cantidad).toBe('90');
  });

  it('no genera movimientos para servicios', () => {
    expect(
      calcularConsumo([{ ...contexto, lineaId: 'linea-servicio', estrategiaConsumo: 'ninguno' }]),
    ).toEqual([]);
  });

  it('agrupa por insumo y conserva todos los orígenes con la política más restrictiva', () => {
    const lineas: LineaParaConsumo[] = [
      {
        ...contexto,
        lineaId: 'linea-a',
        cantidad: '1',
        estrategiaConsumo: 'receta',
        permiteVentaSinStock: true,
        receta: [{ insumoId: 'sal', cantidad: '2.5', unidad: 'g', unidadBase: 'g' }],
      },
      {
        ...contexto,
        lineaId: 'linea-b',
        cantidad: '2',
        estrategiaConsumo: 'receta',
        receta: [{ insumoId: 'sal', cantidad: '1.25', unidad: 'g', unidadBase: 'g' }],
      },
    ];

    expect(calcularConsumo(lineas)).toMatchObject([
      {
        insumoId: 'sal',
        cantidad: '5',
        permiteNegativo: false,
        origenes: ['linea-a', 'linea-b'],
      },
    ]);
  });

  it('no pierde precisión al multiplicar cantidades mayores que Number.MAX_SAFE_INTEGER', () => {
    const [movimiento] = calcularConsumo([
      {
        ...contexto,
        lineaId: 'linea-grande',
        cantidad: '9999999999',
        estrategiaConsumo: 'receta',
        receta: [{ insumoId: 'micro', cantidad: '0.0001', unidad: 'g', unidadBase: 'g' }],
      },
    ]);

    expect(movimiento?.cantidad).toBe('999999.9999');
  });

  it.each([
    {
      nombre: 'cantidad cero',
      linea: {
        ...contexto,
        lineaId: 'cero',
        cantidad: '0',
        estrategiaConsumo: 'sku',
        insumoId: 'sku',
        unidadVenta: 'pieza',
        unidadBase: 'pieza',
      },
    },
    {
      nombre: 'unidad incompatible',
      linea: {
        ...contexto,
        lineaId: 'unidad',
        estrategiaConsumo: 'sku',
        insumoId: 'sku',
        unidadVenta: 'kg',
        unidadBase: 'ml',
      },
    },
    {
      nombre: 'merma que no cabe en cuatro decimales',
      linea: {
        ...contexto,
        lineaId: 'merma',
        cantidad: '1',
        estrategiaConsumo: 'receta',
        receta: [
          {
            insumoId: 'polvo',
            cantidad: '0.0001',
            unidad: 'g',
            unidadBase: 'g',
            mermaPorcentaje: '1',
          },
        ],
      },
    },
  ])('rechaza $nombre sin corregir el dato en silencio', ({ linea }) => {
    expect(() => calcularConsumo([linea as LineaParaConsumo])).toThrow(ErrorDominio);
  });

  it('rechaza mezclar órdenes para no fabricar una referencia ambigua', () => {
    expect(() =>
      calcularConsumo([
        {
          ...contexto,
          lineaId: 'a',
          estrategiaConsumo: 'ninguno',
        },
        {
          ...contexto,
          ordenId: 'orden-b',
          lineaId: 'b',
          estrategiaConsumo: 'ninguno',
        },
      ]),
    ).toThrow(ErrorDominio);
  });
});
