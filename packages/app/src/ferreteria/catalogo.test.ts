import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import {
  contextoFalso,
  crearBaseFalsa,
  type TablasFalsas,
} from '../restaurante/pruebas/base-falsa.ts';
import { ambitoDe, ORG } from '../restaurante/pruebas/sala.ts';
import { buscarMaterial, declararAtributo } from './catalogo.ts';

/**
 * F-059 y F-201 · El catálogo que sí se puede buscar.
 *
 * «Tornillo» devuelve 340 resultados sin orden y el mostradorista usa su
 * memoria en vez del sistema. A partir de ahí el inventario y el margen son
 * ficción, porque lo que salió del anaquel no es lo que se tecleó.
 */

const TORNILLO = 'p1111111-1111-4111-8111-111111111111';
const LLAVE_METRICA = 'p2222222-2222-4222-8222-222222222222';
const GAVETA = 'u1111111-1111-4111-8111-111111111111';
const AHORA = new Date('2026-09-15T18:00:00.000Z');

const producto = (id: string, nombre: string, extra: Record<string, unknown> = {}) => ({
  id,
  organizacion_id: ORG,
  nombre,
  precio_venta_centavos: 350n,
  ubicacion_id: GAVETA,
  activo: true,
  ...extra,
});

const atributo = (
  productoId: string,
  clave: string,
  original: string,
  micras: bigint | null,
  texto: string | null = null,
) => ({
  id: `${productoId}-${clave}`,
  organizacion_id: ORG,
  producto_id: productoId,
  clave,
  valor_texto: texto,
  valor_normalizado: micras,
  valor_original: original,
});

function ferreteria(extra: Partial<TablasFalsas> = {}): TablasFalsas {
  return {
    productos: [
      producto(TORNILLO, 'Tornillo tirafondo 1/4 × 2'),
      producto(LLAVE_METRICA, 'Llave española 13 mm'),
    ],
    producto_atributos: [
      atributo(TORNILLO, 'diametro', '1/4"', 6_350n),
      atributo(TORNILLO, 'acabado', 'galvanizado', null, 'galvanizado'),
      atributo(LLAVE_METRICA, 'diametro', '13 mm', 13_000n),
    ],
    ubicaciones: [{ id: GAVETA, organizacion_id: ORG, codigo: 'B-14', activa: true }],
    ...extra,
  };
}

const baseDe = (extra: Partial<TablasFalsas> = {}) =>
  crearBaseFalsa(ferreteria(extra), {
    predeterminados: {
      producto_atributos: { valor_texto: null, valor_normalizado: null },
    },
  });

async function codigoDe(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return 'NO LANZÓ';
  } catch (error) {
    return esErrorDominio(error) ? error.codigo : `INESPERADO: ${String(error)}`;
  }
}

describe('catalogo.declarar_atributo', () => {
  it('EL SERVIDOR NORMALIZA, y guarda el original al lado', async () => {
    // Con la conversión en el navegador hay tantas conversiones como versiones
    // del navegador haya instaladas, y el mismo tornillo acaba dos veces.
    const base = baseDe({ producto_atributos: [] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('almacen'), AHORA);

    const salida = await declararAtributo.ejecutar(ctx, {
      productoId: TORNILLO,
      clave: 'diametro',
      valor: '1/4"',
      tipo: 'medida',
    });

    expect(salida.valorNormalizado).toBe('6350');
    expect(base.campo('producto_atributos', 'valor_original')).toBe('1/4"');
  });

  it('UN ATRIBUTO DE LISTA NO TIENE DIÁMETRO', async () => {
    // Guardar «galvanizado» con valor normalizado lo metería en la búsqueda por
    // medida, donde no significa nada.
    const base = baseDe({ producto_atributos: [] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('almacen'), AHORA);

    await declararAtributo.ejecutar(ctx, {
      productoId: TORNILLO,
      clave: 'acabado',
      valor: 'galvanizado',
      tipo: 'lista',
    });

    expect(base.campo('producto_atributos', 'valor_normalizado')).toBeNull();
    expect(base.campo('producto_atributos', 'valor_texto')).toBe('galvanizado');
  });

  it('REDECLARAR NO DUPLICA: una clave, un valor', async () => {
    // Dos filas de `diametro` harían que el mismo tornillo apareciera en dos
    // búsquedas distintas y en ninguna completo.
    const base = baseDe();
    const uno = contextoFalso(base.tx, ambitoDe('almacen'), AHORA);

    await declararAtributo.ejecutar(uno.ctx, {
      productoId: TORNILLO,
      clave: 'diametro',
      valor: '6.35 mm',
      tipo: 'medida',
    });

    const delTornillo = base
      .filas('producto_atributos')
      .filter((f) => f['producto_id'] === TORNILLO && f['clave'] === 'diametro');
    expect(delTornillo).toHaveLength(1);
    // El original se reemplaza por el nuevo: es lo que la persona acaba de
    // teclear, y el normalizado sigue siendo el mismo número.
    expect(delTornillo[0]?.['valor_original']).toBe('6.35 mm');
    expect(delTornillo[0]?.['valor_normalizado']).toBe(6_350n);
  });

  it('una medida que no se entiende no entra al catálogo', async () => {
    const base = baseDe({ producto_atributos: [] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('almacen'), AHORA);

    expect(
      await codigoDe(() =>
        declararAtributo.ejecutar(ctx, {
          productoId: TORNILLO,
          clave: 'diametro',
          valor: 'grandecito',
          tipo: 'medida',
        }),
      ),
    ).toBe('CATALOGO_INVALIDO');
    expect(base.filas('producto_atributos')).toEqual([]);
  });

  it('un producto de otro catálogo', async () => {
    const base = baseDe({ productos: [] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('almacen'), AHORA);

    expect(
      await codigoDe(() =>
        declararAtributo.ejecutar(ctx, {
          productoId: TORNILLO,
          clave: 'diametro',
          valor: '1/4"',
          tipo: 'medida',
        }),
      ),
    ).toBe('PRODUCTO_NO_ENCONTRADO');
  });
});

describe('catalogo.buscar_material', () => {
  it('BUSCAR 1/2 ENCUENTRA LA DE 13 MM', async () => {
    // 12,700 contra 13,000: trescientas micras y la misma tuerca. Sin la
    // tolerancia, el mostradorista no encuentra nunca la equivalencia que usa
    // todos los días.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await buscarMaterial.ejecutar(ctx, {
      atributos: [{ clave: 'diametro', valor: '1/2"', tipo: 'medida' }],
      toleranciaMicras: 300,
      limite: 20,
    });

    expect(salida.encontrados.map((e) => e.productoId)).toEqual([LLAVE_METRICA]);
  });

  it('CON TOLERANCIA CERRADA no se confunden dos piezas', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await buscarMaterial.ejecutar(ctx, {
      atributos: [{ clave: 'diametro', valor: '1/2"', tipo: 'medida' }],
      toleranciaMicras: 100,
      limite: 20,
    });

    expect(salida.encontrados).toEqual([]);
  });

  it('LAS TRES ESCRITURAS ENCUENTRAN LO MISMO', async () => {
    const base = baseDe();

    for (const escritura of ['1/4"', '.25', '6.35 mm']) {
      const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);
      const salida = await buscarMaterial.ejecutar(ctx, {
        atributos: [{ clave: 'diametro', valor: escritura, tipo: 'medida' }],
        toleranciaMicras: 0,
        limite: 20,
      });
      expect(salida.encontrados.map((e) => e.productoId)).toEqual([TORNILLO]);
    }
  });

  it('LO QUE CASA CON MÁS FILTROS VA ARRIBA', async () => {
    // El que cumple los dos que tecleó el mostradorista es el que busca; el que
    // cumple uno es ruido que sólo sirve si no hay nada mejor.
    const base = baseDe({
      producto_atributos: [
        atributo(TORNILLO, 'diametro', '1/4"', 6_350n),
        atributo(TORNILLO, 'acabado', 'galvanizado', null, 'galvanizado'),
        atributo(LLAVE_METRICA, 'acabado', 'galvanizado', null, 'galvanizado'),
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await buscarMaterial.ejecutar(ctx, {
      atributos: [
        { clave: 'diametro', valor: '1/4"', tipo: 'medida' },
        { clave: 'acabado', valor: 'galvanizado', tipo: 'lista' },
      ],
      toleranciaMicras: 0,
      limite: 20,
    });

    expect(salida.encontrados.map((e) => e.productoId)).toEqual([TORNILLO, LLAVE_METRICA]);
    expect(salida.encontrados[0]?.atributosQueCasan).toBe(2);
  });

  it('LA UBICACIÓN VIAJA CON EL RESULTADO', async () => {
    // Encontrar la clave y después tener que preguntar dónde está es la mitad
    // del trabajo sin hacer.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await buscarMaterial.ejecutar(ctx, {
      atributos: [{ clave: 'diametro', valor: '1/4"', tipo: 'medida' }],
      toleranciaMicras: 0,
      limite: 20,
    });

    expect(salida.encontrados[0]?.ubicacion).toBe('B-14');
  });

  it('EL TEXTO NO DISTINGUE MAYÚSCULAS', async () => {
    // Nadie teclea «Galvanizado» dos veces igual.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await buscarMaterial.ejecutar(ctx, {
      atributos: [{ clave: 'acabado', valor: 'GALVANIZADO', tipo: 'lista' }],
      toleranciaMicras: 0,
      limite: 20,
    });

    expect(salida.encontrados.map((e) => e.productoId)).toEqual([TORNILLO]);
  });

  it('EL PRODUCTO ARCHIVADO no se ofrece', async () => {
    const base = baseDe({
      productos: [producto(TORNILLO, 'Tornillo tirafondo 1/4 × 2', { activo: false })],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await buscarMaterial.ejecutar(ctx, {
      atributos: [{ clave: 'diametro', valor: '1/4"', tipo: 'medida' }],
      toleranciaMicras: 0,
      limite: 20,
    });

    expect(salida.encontrados).toEqual([]);
  });

  it('sin nada que case, la lista sale vacía y no revienta', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await buscarMaterial.ejecutar(ctx, {
      atributos: [{ clave: 'diametro', valor: '3 m', tipo: 'medida' }],
      toleranciaMicras: 0,
      limite: 20,
    });

    expect(salida.encontrados).toEqual([]);
    expect(salida.filtros).toBe(1);
  });
});
