import { esErrorDominio } from '@morphiqpos/contracts';
import { cantidad, cantidadATexto } from '@morphiqpos/domain/catalogo';
import { centavos } from '@morphiqpos/domain/dinero';
import { describe, expect, it } from 'vitest';
import type { ZodType } from 'zod';

import { registrarCompra, totalDeLineas, usarPlantillaCompra } from './compras.ts';
import {
  convertirAUnidadBase,
  costoPromedioPonderado,
  equivalenciaCanonica,
  equivalenciaDeLinea,
} from './costeo.ts';
import {
  entradaGuardarPlantillaCompra,
  entradaGuardarPlantillaGasto,
  entradaRegistrarCompra,
  entradaRegistrarGasto,
  entradaUsarPlantillaCompra,
  lineaDeCompra,
  lineaDePlantillaCompra,
} from './esquemas.ts';
import { guardarPlantillaCompra } from './plantillas.ts';

/**
 * E4-5 · compras, sin base de datos.
 *
 * Lo que se prueba aquí es exactamente lo que no necesita Postgres: la
 * aritmética que hoy vive en tres copias en el navegador y la forma de las
 * entradas. La atomicidad —«si falla la línea 3 de 5, falla todo»— se prueba
 * interrumpiendo el paso `registrar_linea_3` contra una base real; los pasos
 * están numerados para eso.
 */

const UUID = '00000000-0000-4000-8000-000000000001';

/** Lo que hace hoy el cliente. Se usa para medir la diferencia, nunca en producción. */
function centavosIngenuos(pesos: number): number {
  return Math.round(pesos * 100);
}

describe('E4-5 · los comandos se declaran igual siempre', () => {
  it('lleva nombres estables de dominio.verbo y escribe en transacción', () => {
    expect(registrarCompra.nombre).toBe('compras.registrar');
    expect(usarPlantillaCompra.nombre).toBe('compras.usar_plantilla');
    expect(guardarPlantillaCompra.nombre).toBe('compras.guardar_plantilla');
    for (const comando of [registrarCompra, usarPlantillaCompra, guardarPlantillaCompra]) {
      expect(comando.escribe).toBe(true);
      expect(comando.paquetes).toEqual(['operativo', 'restaurante_pro']);
    }
  });

  it('autoriza por rol, y ni caja ni mesero ni cocina registran compras', () => {
    for (const comando of [registrarCompra, usarPlantillaCompra, guardarPlantillaCompra]) {
      expect(comando.roles).toEqual(['dueno', 'administrador', 'gerente']);
      expect(comando.roles).not.toContain('cajero');
      expect(comando.roles).not.toContain('mesero');
      expect(comando.roles).not.toContain('cocina');
    }
  });
});

describe('el total lo calcula el servidor sumando las líneas', () => {
  const LINEAS = [{ costoTotal: '1234.995' }, { costoTotal: '45.55' }, { costoTotal: '0.07' }];

  it('suma en centavos exactos y no pierde el centavo del redondeo ingenuo', () => {
    expect(totalDeLineas(LINEAS)).toBe(128_062n);

    // Las dos formas en que hoy se llega al total, y las dos se quedan cortas.
    const porLinea = LINEAS.reduce((suma, l) => suma + centavosIngenuos(Number(l.costoTotal)), 0);
    const enPesos = centavosIngenuos(LINEAS.reduce((suma, l) => suma + Number(l.costoTotal), 0));
    expect(porLinea).toBe(128_061);
    expect(enPesos).toBe(128_061);
  });

  it('1234.995 son 123500 centavos, no 123499', () => {
    expect(totalDeLineas([{ costoTotal: '1234.995' }])).toBe(123_500n);
    expect(centavosIngenuos(1234.995)).toBe(123_499);
  });

  it('descarta el total que mande el cliente en vez de usarlo', () => {
    const analizada = entradaRegistrarCompra.parse({
      total: 999.99,
      total_compra: 999.99,
      lineas: [lineaValida()],
    });
    expect(Object.hasOwn(analizada, 'total')).toBe(false);
    expect(Object.hasOwn(analizada, 'total_compra')).toBe(false);
    expect(totalDeLineas(analizada.lineas)).toBe(1200n);
  });
});

describe('R16 · ningún esquema de entrada acepta total ni rol', () => {
  const CASOS: readonly (readonly [string, ZodType, Record<string, unknown>])[] = [
    ['compras.registrar', entradaRegistrarCompra, { lineas: [lineaValida()] }],
    ['compras.usar_plantilla', entradaUsarPlantillaCompra, { plantillaId: UUID }],
    [
      'compras.guardar_plantilla',
      entradaGuardarPlantillaCompra,
      { nombre: 'Reabasto semanal', lineas: [lineaDePlantillaValida()] },
    ],
    [
      'gastos.registrar',
      entradaRegistrarGasto,
      { categoria: 'servicios', descripcion: 'Recibo CFE', monto: '1200', metodoPago: 'efectivo' },
    ],
    [
      'gastos.guardar_plantilla',
      entradaGuardarPlantillaGasto,
      {
        nombre: 'Renta',
        categoria: 'otro',
        montoSugerido: '12000',
        metodoPago: 'transferencia',
        periodicidad: 'mensual',
      },
    ],
    ['línea de compra', lineaDeCompra, lineaValida()],
    ['línea de plantilla', lineaDePlantillaCompra, lineaDePlantillaValida()],
  ];

  for (const [nombre, esquema, valida] of CASOS) {
    it(`${nombre} descarta total y rol`, () => {
      const analizada: unknown = esquema.parse({
        ...valida,
        total: 1,
        rol: 'administrador',
        organizacion_id: UUID,
      });
      expect(Object.hasOwn(analizada as object, 'total')).toBe(false);
      expect(Object.hasOwn(analizada as object, 'rol')).toBe(false);
      expect(Object.hasOwn(analizada as object, 'organizacion_id')).toBe(false);
    });
  }
});

describe('§23.1 · la equivalencia convierte la compra, y sin ella no se guarda', () => {
  it('tres cajas de 12 kg son 36 000 g', () => {
    const base = convertirAUnidadBase(cantidad('3'), cantidad('12000'));
    expect(cantidadATexto(base)).toBe('36000');
  });

  it('deja la equivalencia al usuario en las unidades de empaque', () => {
    expect(equivalenciaCanonica('caja', 'g')).toBeNull();
    // `bolsa` es una de las nueve DEFAULT_UNIDADES_COMPRA y el dominio no la conoce.
    expect(equivalenciaCanonica('bolsa', 'g')).toBeNull();
    expect(equivalenciaDeLinea('caja', 'g', cantidad('12000'))).toBe(cantidad('12000'));
  });

  it('la fija el catálogo en las unidades estándar, con sus alias', () => {
    expect(equivalenciaCanonica('kg', 'g')).toBe(cantidad('1000'));
    expect(equivalenciaCanonica('litro', 'ml')).toBe(cantidad('1000'));
    expect(equivalenciaCanonica('g', 'g')).toBe(cantidad('1'));
  });

  it('rechaza el respaldo «1» que manda hoy el diálogo para una compra en kg', () => {
    // RegistrarCompraDialog.jsx:301 manda `cantidad_por_compra_default || 1` y
    // luego lo ignora. Aceptarlo aquí convertiría 3 kg en 3 g.
    expect(() => equivalenciaDeLinea('kg', 'g', cantidad('1'))).toThrow(/1000 g/);
    expect(codigoDe(() => equivalenciaDeLinea('kg', 'g', cantidad('1')))).toBe('COMPRA_INVALIDA');
    expect(equivalenciaDeLinea('kg', 'g', cantidad('1000'))).toBe(cantidad('1000'));
  });

  it('no deja comprar en kg un insumo que se cuenta por piezas', () => {
    expect(codigoDe(() => equivalenciaCanonica('kg', 'pieza'))).toBe('COMPRA_INVALIDA');
  });

  it('falla en vez de redondear cuando la conversión no cabe en cuatro decimales', () => {
    expect(codigoDe(() => convertirAUnidadBase(cantidad('0.3333'), cantidad('1.5')))).toBe(
      'COMPRA_INVALIDA',
    );
  });

  it('exige equivalencia y cantidad positivas en cada línea', () => {
    expect(lineaDeCompra.safeParse({ ...lineaValida(), equivalencia: '0' }).success).toBe(false);
    expect(lineaDeCompra.safeParse({ ...lineaValida(), cantidadCapturada: '0' }).success).toBe(
      false,
    );
    // O insumo existente o insumo nuevo, nunca las dos cosas ni ninguna.
    const dos = { ...lineaValida(), nuevo: { nombre: 'Jitomate', unidadBase: 'g' } };
    expect(lineaDeCompra.safeParse(dos).success).toBe(false);
    const sinInsumo = {
      cantidadCapturada: '3',
      unidadCapturada: 'caja',
      equivalencia: '12000',
      costoTotal: '12',
    };
    expect(lineaDeCompra.safeParse(sinInsumo).success).toBe(false);
  });
});

describe('§14.2 · costo promedio ponderado — D-13', () => {
  it('con existencia en cero el promedio es el costo de esta compra', () => {
    // Una pieza por $1234.995: el promedio ingenuo se queda en $1234.99.
    expect(
      costoPromedioPonderado({
        existenciaAnterior: 0n,
        costoAnteriorCentavos: centavos(0n),
        cantidadEntrante: cantidad('1'),
        costoTotalCentavos: centavos(123_500n),
      }),
    ).toBe(123_500n);
  });

  it('pondera contra la existencia anterior con aritmética exacta', () => {
    // 1000 g a 7 c/g + 1000 g por $45.55 → (7 000 000 + 455 500)/2000 g
    expect(
      costoPromedioPonderado({
        existenciaAnterior: cantidad('1000'),
        costoAnteriorCentavos: centavos(7n),
        cantidadEntrante: cantidad('1000'),
        costoTotalCentavos: centavos(4555n),
      }),
    ).toBe(6n);
  });

  it('redondea la mitad alejándose del cero, no hacia abajo', () => {
    // (3 + 4) / 2 = 3.5 → 4. Truncar daría 3 y el margen saldría inflado.
    expect(
      costoPromedioPonderado({
        existenciaAnterior: cantidad('1'),
        costoAnteriorCentavos: centavos(3n),
        cantidadEntrante: cantidad('1'),
        costoTotalCentavos: centavos(4n),
      }),
    ).toBe(4n);
  });

  it('una existencia negativa no envenena el promedio', () => {
    // Cinco piezas en negativo son deuda con el conteo físico, no inventario
    // con costo. Ponderar contra ellas daría $10.75 en vez de los $7 pagados.
    expect(
      costoPromedioPonderado({
        existenciaAnterior: -(cantidad('5') as bigint),
        costoAnteriorCentavos: centavos(1000n),
        cantidadEntrante: cantidad('1'),
        costoTotalCentavos: centavos(700n),
      }),
    ).toBe(700n);
  });

  it('no acepta una compra sin cantidad', () => {
    expect(
      codigoDe(() =>
        costoPromedioPonderado({
          existenciaAnterior: 0n,
          costoAnteriorCentavos: centavos(0n),
          cantidadEntrante: cantidad('0'),
          costoTotalCentavos: centavos(100n),
        }),
      ),
    ).toBe('COMPRA_INVALIDA');
  });
});

function lineaValida(): Record<string, unknown> {
  return {
    insumoId: UUID,
    cantidadCapturada: '3',
    unidadCapturada: 'caja',
    equivalencia: '12000',
    costoTotal: '12',
  };
}

function lineaDePlantillaValida(): Record<string, unknown> {
  return {
    insumoId: UUID,
    cantidad: '3',
    unidadCompra: 'caja',
    equivalencia: '12000',
    costoTotal: '12',
  };
}

/** El código del `ErrorDominio` que lanzó, o `null` si no lanzó ninguno. */
function codigoDe(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (error) {
    return esErrorDominio(error) ? error.codigo : null;
  }
}
