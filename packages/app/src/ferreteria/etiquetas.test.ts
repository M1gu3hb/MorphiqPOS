import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import {
  contextoFalso,
  crearBaseFalsa,
  type TablasFalsas,
} from '../restaurante/pruebas/base-falsa.ts';
import { ambitoDe, ORG } from '../restaurante/pruebas/sala.ts';
import { etiquetasDeProducto } from './etiquetas.ts';

/**
 * F-058 · La etiqueta, que en una ferretería es requisito de operación.
 *
 * ── Lo que estas pruebas defienden ───────────────────────────────────────
 * Que se imprima `valor_original` y no el normalizado. El mostradorista busca
 * `1/4` y espera ver `1/4"`; una etiqueta que dice 6,35 mm no la lee nadie, y
 * reconstruir la fracción desde 6350 µm es ambiguo.
 *
 * Que la UBICACIÓN sólo vaya en la etiqueta de gaveta. En la de anaquel no cabe
 * y no le sirve a nadie: el cliente no va a la bodega.
 *
 * Y que los productos que no existen SE CUENTEN. Pedir cien etiquetas y recibir
 * noventa y ocho sin que nadie lo diga es cómo dos gavetas se quedan sin
 * etiqueta durante un año.
 */

const AHORA = new Date('2026-09-16T12:00:00.000Z');
const TORNILLO = 'f1000000-0000-4000-8000-000000000001';
const TUERCA = 'f1000000-0000-4000-8000-000000000002';
const UBICACION = 'f9000000-0000-4000-8000-000000000001';

function baseDe(extra: Partial<TablasFalsas> = {}) {
  return crearBaseFalsa({
    productos: [
      {
        id: TORNILLO,
        organizacion_id: ORG,
        nombre: 'Tornillo 1/4 x 2',
        sku: 'TOR-1425',
        codigo_barras: null,
        precio_venta_centavos: 250n,
        ubicacion_id: UBICACION,
      },
    ],
    ubicaciones: [{ id: UBICACION, organizacion_id: ORG, codigo: 'P3-G12' }],
    producto_atributos: [
      {
        id: 'a1',
        organizacion_id: ORG,
        producto_id: TORNILLO,
        clave: 'diametro',
        valor_normalizado: 6_350n,
        valor_original: '1/4"',
      },
    ],
    ...extra,
  });
}

async function codigoDe(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return 'NO LANZÓ';
  } catch (error) {
    return esErrorDominio(error) ? error.codigo : `INESPERADO: ${String(error)}`;
  }
}

describe('F-058 · las etiquetas', () => {
  it('IMPRIME LO QUE SE TECLEÓ, no el normalizado', async () => {
    // Una etiqueta que dice 6,35 mm no la lee nadie.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await etiquetasDeProducto.ejecutar(ctx, {
      productoIds: [TORNILLO],
      formato: 'gaveta',
      copias: 1,
    });

    expect(salida.etiquetas[0]?.atributos).toEqual([{ etiqueta: 'diametro', valor: '1/4"' }]);
  });

  it('LA UBICACIÓN sólo va en la de GAVETA', async () => {
    // En la de anaquel no cabe: el cliente no va a la bodega.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const gaveta = await etiquetasDeProducto.ejecutar(ctx, {
      productoIds: [TORNILLO],
      formato: 'gaveta',
      copias: 1,
    });
    const anaquel = await etiquetasDeProducto.ejecutar(ctx, {
      productoIds: [TORNILLO],
      formato: 'anaquel',
      copias: 1,
    });

    expect(gaveta.etiquetas[0]?.ubicacion).toBe('P3-G12');
    expect(anaquel.etiquetas[0]?.ubicacion).toBeNull();
  });

  it('marca el CÓDIGO INTERNO, que es el que no está en el catálogo del proveedor', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await etiquetasDeProducto.ejecutar(ctx, {
      productoIds: [TORNILLO],
      formato: 'anaquel',
      copias: 1,
    });

    expect(salida.etiquetas[0]?.codigo).toBe('TOR-1425');
    expect(salida.etiquetas[0]?.codigoInterno).toBe(true);
  });

  it('el de FÁBRICA gana cuando lo hay', async () => {
    const base = baseDe({
      productos: [
        {
          id: TORNILLO,
          organizacion_id: ORG,
          nombre: 'Taladro',
          sku: 'TAL-01',
          codigo_barras: '7501234567890',
          precio_venta_centavos: 120_000n,
          ubicacion_id: null,
        },
      ],
      producto_atributos: [],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await etiquetasDeProducto.ejecutar(ctx, {
      productoIds: [TORNILLO],
      formato: 'anaquel',
      copias: 1,
    });

    expect(salida.etiquetas[0]?.codigo).toBe('7501234567890');
    expect(salida.etiquetas[0]?.codigoInterno).toBe(false);
  });

  it('LOS QUE NO EXISTEN SE CUENTAN', async () => {
    // Pedir cien y recibir noventa y ocho en silencio deja dos gavetas sin
    // etiqueta durante un año.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await etiquetasDeProducto.ejecutar(ctx, {
      productoIds: [TORNILLO, TUERCA],
      formato: 'anaquel',
      copias: 1,
    });

    expect(salida.etiquetas).toHaveLength(1);
    expect(salida.noEncontrados).toBe(1);
  });

  it('las copias viajan en cada renglón', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await etiquetasDeProducto.ejecutar(ctx, {
      productoIds: [TORNILLO],
      formato: 'anaquel',
      copias: 12,
    });

    expect(salida.etiquetas[0]?.copias).toBe(12);
  });

  it('si no existe ninguno se dice, no se devuelve una hoja en blanco', async () => {
    const base = baseDe({ productos: [] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    expect(
      await codigoDe(() =>
        etiquetasDeProducto.ejecutar(ctx, {
          productoIds: [TORNILLO],
          formato: 'anaquel',
          copias: 1,
        }),
      ),
    ).toBe('PRODUCTO_NO_ENCONTRADO');
  });
});
