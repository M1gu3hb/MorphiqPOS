import { esErrorDominio } from '@morphiqpos/contracts';
import { cantidad, cantidadATexto } from '@morphiqpos/domain/catalogo';
import { describe, expect, it } from 'vitest';

import { convertirAUnidadBase } from './costeo.ts';
import { entradaRegistrarCompra, MAXIMO_LINEAS_DE_COMPRA } from './esquemas.ts';
import {
  equivalenciaDeLineaGuardada,
  leerLineasGuardadas,
  lineaGuardada,
  type InsumoDePlantilla,
  type LineaGuardada,
} from './plantilla-lineas.ts';

/**
 * Las dos reglas del camino de plantilla que el verificador encontró rotas.
 *
 * Están escritas para MORDER: cada una falla si se repone el defecto que
 * cierra. La equivalencia inventada y el tope que sólo valía en un camino son
 * las dos cosas que no se pueden volver a colar.
 */

const JITOMATE: InsumoDePlantilla = {
  id: '00000000-0000-4000-8000-000000000001',
  nombre: 'Jitomate',
  unidadBase: 'g',
};

describe('§23.1 · la equivalencia de una plantilla no se inventa nunca', () => {
  it('PARA cuando la unidad es de empaque y la plantilla no la guardó', () => {
    // El defecto: se caía a `insumos.cantidad_por_compra_default`, la columna
    // que la pantalla vieja llena con la CANTIDAD comprada. Con un 3 heredado
    // de «3 cajas», repetir la compra guardaba esto en vez de 36 000 g:
    expect(cantidadATexto(convertirAUnidadBase(cantidad('3'), cantidad('3')))).toBe('9');

    const linea = lineaGuardadaDe({ unidad_compra: 'caja' });
    expect(codigoDe(() => equivalenciaDeLineaGuardada(linea, JITOMATE, 'Reabasto semanal'))).toBe(
      'COMPRA_INVALIDA',
    );
    expect(() => equivalenciaDeLineaGuardada(linea, JITOMATE, 'Reabasto semanal')).toThrow(
      /cuántas g trae una caja/,
    );
  });

  it('tampoco la inventa para una unidad que el catálogo no conoce', () => {
    // `bolsa` es una de las nueve DEFAULT_UNIDADES_COMPRA: el catálogo no la
    // convierte, así que sin equivalencia guardada tampoco hay compra.
    const linea = lineaGuardadaDe({ unidad_compra: 'bolsa' });
    expect(codigoDe(() => equivalenciaDeLineaGuardada(linea, JITOMATE, 'Abarrotes'))).toBe(
      'COMPRA_INVALIDA',
    );
  });

  it('usa la del catálogo cuando es el catálogo quien la fija', () => {
    const linea = lineaGuardadaDe({ unidad_compra: 'kg' });
    expect(equivalenciaDeLineaGuardada(linea, JITOMATE, 'Reabasto semanal')).toBe('1000');
  });

  it('respeta la que la plantilla guardó', () => {
    const linea = lineaGuardadaDe({ unidad_compra: 'caja', equivalencia: '12000' });
    expect(equivalenciaDeLineaGuardada(linea, JITOMATE, 'Reabasto semanal')).toBe('12000');
  });

  it('para si la línea apunta a un insumo que ya no existe', () => {
    const linea = lineaGuardadaDe({ unidad_compra: 'kg' });
    expect(codigoDe(() => equivalenciaDeLineaGuardada(linea, undefined, 'Reabasto semanal'))).toBe(
      'INVENTARIO_INVALIDO',
    );
  });
});

describe('el tope de líneas vale en los DOS caminos que acaban en una compra', () => {
  it('rechaza una plantilla con más líneas de las que admite una compra', () => {
    const demasiadas = lineasGuardadas(MAXIMO_LINEAS_DE_COMPRA + 1);
    expect(codigoDe(() => leerLineasGuardadas(demasiadas, 'Reabasto semanal'))).toBe(
      'COMPRA_INVALIDA',
    );
    expect(() => leerLineasGuardadas(demasiadas, 'Reabasto semanal')).toThrow(/61 líneas/);
  });

  it('acepta justo el máximo', () => {
    expect(leerLineasGuardadas(lineasGuardadas(MAXIMO_LINEAS_DE_COMPRA), 'Reabasto')).toHaveLength(
      MAXIMO_LINEAS_DE_COMPRA,
    );
  });

  it('es el MISMO tope que declara `compras.registrar`', () => {
    // Si los dos números se separan, uno de los dos caminos deja de estar
    // protegido y nadie se entera hasta que la caja se congela.
    const unaMas = lineasDeCompra(MAXIMO_LINEAS_DE_COMPRA + 1);
    expect(entradaRegistrarCompra.safeParse({ lineas: unaMas }).success).toBe(false);
    expect(codigoDe(() => leerLineasGuardadas(lineasGuardadas(unaMas.length), 'X'))).toBe(
      'COMPRA_INVALIDA',
    );

    const justas = lineasDeCompra(MAXIMO_LINEAS_DE_COMPRA);
    expect(entradaRegistrarCompra.safeParse({ lineas: justas }).success).toBe(true);
    expect(leerLineasGuardadas(lineasGuardadas(justas.length), 'X')).toHaveLength(justas.length);
  });

  it('sigue rechazando una plantilla vacía o ilegible', () => {
    expect(codigoDe(() => leerLineasGuardadas([], 'Vacía'))).toBe('COMPRA_INVALIDA');
    expect(codigoDe(() => leerLineasGuardadas('no soy un arreglo', 'Rota'))).toBe(
      'COMPRA_INVALIDA',
    );
  });
});

function lineaGuardadaDe(extra: Readonly<Record<string, unknown>>): LineaGuardada {
  return lineaGuardada.parse({
    ingrediente_id: JITOMATE.id,
    ingrediente_nombre: JITOMATE.nombre,
    cantidad: '3',
    unidad_compra: 'caja',
    costo_total: '1200',
    ...extra,
  });
}

/** `n` líneas tal y como viven en el `jsonb` de la plantilla. */
function lineasGuardadas(n: number): readonly Record<string, unknown>[] {
  return Array.from({ length: n }, () => ({
    ingrediente_id: JITOMATE.id,
    cantidad: '1',
    unidad_compra: 'kg',
    costo_total: '10',
    equivalencia: '1000',
  }));
}

/** `n` líneas tal y como las manda el cuerpo de `compras.registrar`. */
function lineasDeCompra(n: number): readonly Record<string, unknown>[] {
  return Array.from({ length: n }, () => ({
    insumoId: JITOMATE.id,
    cantidadCapturada: '1',
    unidadCapturada: 'kg',
    equivalencia: '1000',
    costoTotal: '10',
  }));
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
