import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import { ordenDeBloqueo } from './compras.ts';
import { exigirUnidadBaseDelGiro } from './insumos.ts';
import { fechaDelGastoEnEfectivo } from './sesion-de-caja.ts';

/**
 * Las guardas que el verificador encontró abiertas.
 *
 * Tres son puras y se prueban llamándolas. Las otras dos viven dentro de un
 * `where` de Kysely, y probarlas de verdad exige Postgres —que este paquete no
 * tiene—: para ésas se afirma el CONTRATO sobre el código fuente, leyéndolo
 * como datos igual que hace `puente/cobertura.test.ts`. No sustituye a una
 * prueba de integración y no pretende hacerlo; lo que hace es que quitar el
 * filtro salga en rojo en vez de salir en verde.
 */

const AQUI = dirname(fileURLToPath(import.meta.url));

function fuente(archivo: string): string {
  return readFileSync(join(AQUI, archivo), 'utf8');
}

/** La comprobación del giro, envuelta para que la flecha no devuelva `void`. */
function giro(paquete: string, unidadBase: string): null {
  exigirUnidadBaseDelGiro(paquete, unidadBase, 'Harina');
  return null;
}

describe('regla 7 · un insumo de restaurante se mide en g, ml o pieza', () => {
  it('rechaza kg, l y m en un restaurante, con la regla y no con un check_violation', () => {
    // El trigger `insumos_unidad_base_por_giro` (046) lo rechaza igual, pero
    // como excepción cruda de Postgres y después de haber escrito la cabecera
    // y las líneas anteriores. Aquí el usuario lee qué corregir.
    for (const unidad of ['kg', 'l', 'm']) {
      expect(codigoDe(() => giro('restaurante', unidad))).toBe('COMPRA_INVALIDA');
    }
    expect(() => giro('restaurante', 'kg')).toThrow(/g, ml o pieza/);
  });

  it('deja pasar las tres del giro', () => {
    for (const unidad of ['g', 'ml', 'pieza']) {
      expect(codigoDe(() => giro('restaurante', unidad))).toBeNull();
    }
  });

  it('no le impone el recorte a los demás giros: una ferretería compra en metros', () => {
    expect(codigoDe(() => giro('ferreteria', 'm'))).toBeNull();
    expect(codigoDe(() => giro('tienda', 'kg'))).toBeNull();
  });
});

describe('§25.2 · un gasto en efectivo se fecha con la sesión que lo va a pagar', () => {
  const SESION = { id: '00000000-0000-4000-8000-000000000009', fecha: '2026-09-09' };

  it('rechaza la fecha de otro día en vez de descuadrar el arqueo', () => {
    // El escenario: $500 de efectivo fechados «el lunes pasado» dejaban el
    // movimiento de caja colgado de la sesión de HOY.
    expect(codigoDe(() => fechaDelGastoEnEfectivo('2026-09-07', SESION))).toBe('GASTO_INVALIDO');
    expect(() => fechaDelGastoEnEfectivo('2026-09-07', SESION)).toThrow(/2026-09-09/);
  });

  it('rechaza también una fecha futura', () => {
    expect(codigoDe(() => fechaDelGastoEnEfectivo('2027-01-01', SESION))).toBe('GASTO_INVALIDO');
  });

  it('acepta la del día de la sesión, y la pone cuando no viene ninguna', () => {
    expect(fechaDelGastoEnEfectivo('2026-09-09', SESION)).toBe('2026-09-09');
    expect(fechaDelGastoEnEfectivo(undefined, SESION)).toBe('2026-09-09');
  });
});

describe('el recálculo de costos no pelea con la compra de al lado', () => {
  it('quita los repetidos y fija un orden que no depende del planificador', () => {
    const ids = ['c', 'a', 'b', 'a'];
    expect(ordenDeBloqueo(ids)).toEqual(['a', 'b', 'c']);
    // Dos transacciones que reciban los mismos ids en distinto orden bloquean
    // en la misma secuencia: una espera, ninguna muere de deadlock.
    expect(ordenDeBloqueo(['b', 'c', 'a'])).toEqual(ordenDeBloqueo(ids));
    // Y no muta lo que le dan.
    expect(ids).toEqual(['c', 'a', 'b', 'a']);
  });

  it('nunca recalcula la organización entera: toda llamada lleva su producto', () => {
    const codigo = fuente('compras.ts');
    const llamadas = [...codigo.matchAll(/recalcularCostosRecetas\(([^)]*)\)/g)];
    expect(llamadas.length).toBeGreaterThan(0);
    for (const [, argumentos] of llamadas) {
      expect(argumentos).toContain('productoId');
    }
  });
});

describe('contratos de las guardas que viven en un `where`', () => {
  it('el contador de plantilla exige `activa`, igual que la lectura', () => {
    const codigo = fuente('plantillas.ts');
    const contador = codigo.slice(codigo.indexOf('export async function marcarPlantillaUsada'));
    expect(contador).toContain(".where('activa', '=', true)");
  });

  it('el camino de plantilla no vuelve a LEER `cantidad_por_compra_default`', () => {
    // Es la columna corrompida por la pantalla vieja. Que no vuelva a ningún
    // `select` de este archivo es lo que impide reponer el respaldo que
    // inventaba la equivalencia: sin leerla, no hay de dónde sacar el número
    // falso. Se mira el `select` y no el archivo entero porque el comentario
    // que explica POR QUÉ no se lee sí tiene que nombrarla.
    const selects = [...fuente('plantillas.ts').matchAll(/\.select\(([^)]*)\)/g)];
    expect(selects.length).toBeGreaterThan(0);
    for (const [, columnas] of selects) {
      expect(columnas).not.toContain('cantidad_por_compra_default');
    }
  });
});

/** El código del `ErrorDominio` que lanzó, o `null` si no lanzó ninguno. */
function codigoDe(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (error) {
    return esErrorDominio(error) ? error.codigo : null;
  }
}
