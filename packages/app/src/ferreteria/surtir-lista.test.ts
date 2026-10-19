import { describe, expect, it } from 'vitest';

import { contextoFalso, crearBaseFalsa, type Fila } from '../restaurante/pruebas/base-falsa.ts';
import { ambitoDe, ORG, SUCURSAL } from '../restaurante/pruebas/sala.ts';
import {
  entradaRenglonesDeLista,
  entradaSurtirLista,
  renglonesDeLista,
  surtirLista,
} from './surtir-lista.ts';

/**
 * `lista_trabajo.surtir` · el papel del albañil se vuelve una nota de caja (F-153).
 *
 * Lo que defiende: que lo entregado se CUENTE en el renglón —la columna `surtida`
 * no la escribía nadie y la lista se quedaba en «0 de 23» para siempre—, que la
 * partida la valore el servidor, que no se entregue más de lo pedido y que la
 * lista pase a `parcial` o a `surtida` (con su fecha) según lo que falte.
 */

const AHORA = new Date('2026-09-26T16:00:00.000Z');
const LISTA = '11500000-0000-4000-8000-000000000001';
const VARILLA = 'b0000000-0000-4000-8000-000000000010';
const CEMENTO = 'b0000000-0000-4000-8000-000000000011';
const R_VARILLA = 'c0000000-0000-4000-8000-000000000001';
const R_CEMENTO = 'c0000000-0000-4000-8000-000000000002';

function producto(id: string, nombre: string, precio: bigint, unidad: string): Fila {
  return {
    id,
    organizacion_id: ORG,
    nombre,
    sku: null,
    codigo_barras: null,
    tipo_venta: 'precio_fijo',
    unidad_venta: unidad,
    precio_venta_centavos: precio,
    costo_unitario_centavos: precio / 2n,
    precio_mayoreo_centavos: null,
    cantidad_minima_mayoreo: null,
    unidad_variable: null,
    precio_por_unidad_variable_centavos: null,
    cantidad_minima_variable: null,
    cantidad_maxima_variable: null,
    incremento_variable: null,
    capacidad_contenedor_ml: null,
    ml_por_porcion: null,
    porciones_por_contenedor: null,
    precio_por_porcion_centavos: null,
    estrategia_consumo: 'sku',
    permite_venta_sin_stock: true,
    activo: true,
    unidad_base: unidad,
  };
}

function renglon(id: string, extra: Fila): Fila {
  return {
    id,
    organizacion_id: ORG,
    lista_id: LISTA,
    orden_visual: 0,
    texto_pedido: 'algo',
    producto_id: null,
    cantidad: null,
    unidad: null,
    surtida: '0.0000',
    orden_linea_id: null,
    sin_existencia: false,
    ...extra,
  };
}

function baseDe(estado = 'abierta', renglones?: readonly Fila[]) {
  return crearBaseFalsa(
    {
      listas_trabajo: [
        {
          id: LISTA,
          organizacion_id: ORG,
          sucursal_id: SUCURSAL,
          folio: 'LT-7',
          titulo: 'Losa del 3er piso',
          estado,
          cliente_id: null,
          obra_id: null,
          nombre_libre: 'Don Beto',
          telefono_libre: '5550001111',
          orden_id: null,
          cerrada_en: null,
        },
      ],
      lineas_lista_trabajo: renglones ?? [
        renglon(R_VARILLA, {
          orden_visual: 0,
          texto_pedido: 'diez de varilla del tres',
          producto_id: VARILLA,
          cantidad: '10.0000',
          unidad: 'pieza',
        }),
        renglon(R_CEMENTO, { orden_visual: 1, texto_pedido: 'cemento del gris' }),
      ],
      productos: [
        producto(VARILLA, 'Varilla 3/8', 9_500n, 'pieza'),
        producto(CEMENTO, 'Cemento gris 50 kg', 23_900n, 'paquete'),
      ],
      ordenes: [],
      notas_mostrador: [],
      orden_lineas: [],
    },
    {
      filasCrudas: [{ siguiente: 1n, serie: 'N' }],
      predeterminados: {
        ordenes: { estado: 'borrador', total_centavos: 0n },
        orden_lineas: {
          descuento_centavos: 0n,
          impuesto_centavos: 0n,
          notas: null,
          opciones: null,
          anulada_en: null,
        },
      },
    },
  );
}

function renglonDe(base: ReturnType<typeof baseDe>, id: string): Fila {
  const fila = base.filas('lineas_lista_trabajo').find((r) => r['id'] === id);
  if (fila === undefined) throw new Error(`sin renglón ${id}`);
  return fila;
}

describe('lista_trabajo.surtir', () => {
  it('ENTREGA A MEDIAS: la nota la valora el servidor y el renglón cuenta lo entregado', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await surtirLista.ejecutar(
      ctx,
      entradaSurtirLista.parse({
        listaId: LISTA,
        renglones: [{ renglonId: R_VARILLA, cantidad: '4' }],
      }),
    );

    expect(salida.notaFolio).toBe('N-1');
    expect(salida.partidas).toBe(1);
    expect(base.filas('orden_lineas').map((l) => l['subtotal_centavos'])).toEqual([38_000n]);
    expect(renglonDe(base, R_VARILLA)['surtida']).toBe('4');
    expect(renglonDe(base, R_VARILLA)['orden_linea_id']).toBe(
      base.filas('orden_lineas')[0]?.['id'],
    );
    expect(salida.estado).toBe('parcial');
    expect(base.filas('listas_trabajo')[0]?.['cerrada_en']).toBeNull();
    expect(base.filas('notas_mostrador')[0]?.['nombre_libre']).toBe('Don Beto');
  });

  it('TRADUCE lo que era texto: «cemento del gris» se vuelve el producto, su cantidad y su unidad', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    await surtirLista.ejecutar(
      ctx,
      entradaSurtirLista.parse({
        listaId: LISTA,
        renglones: [
          { renglonId: R_CEMENTO, productoId: CEMENTO, cantidad: '2', cantidadPedida: '5' },
        ],
      }),
    );

    const fila = renglonDe(base, R_CEMENTO);
    expect(fila['producto_id']).toBe(CEMENTO);
    expect(fila['cantidad']).toBe('5');
    expect(fila['unidad']).toBe('paquete');
    expect(fila['surtida']).toBe('2');
    expect(fila['texto_pedido']).toBe('cemento del gris');
  });

  it('NO SE ENTREGA MÁS DE LO QUE PIDIÓ', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    await expect(
      surtirLista.ejecutar(
        ctx,
        entradaSurtirLista.parse({
          listaId: LISTA,
          renglones: [{ renglonId: R_VARILLA, cantidad: '11' }],
        }),
      ),
    ).rejects.toMatchObject({ codigo: 'CANTIDAD_INVALIDA' });
    expect(base.filas('orden_lineas')).toHaveLength(0);
  });

  it('un renglón sin traducir y sin producto no se entrega a ciegas', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    await expect(
      surtirLista.ejecutar(
        ctx,
        entradaSurtirLista.parse({
          listaId: LISTA,
          renglones: [{ renglonId: R_CEMENTO, cantidad: '1' }],
        }),
      ),
    ).rejects.toMatchObject({ codigo: 'CONFIGURACION_INVALIDA' });
  });

  it('COMPLETA: con todo entregado la lista queda SURTIDA y con su fecha', async () => {
    const base = baseDe('parcial', [
      renglon(R_VARILLA, {
        texto_pedido: 'diez de varilla del tres',
        producto_id: VARILLA,
        cantidad: '10.0000',
        unidad: 'pieza',
        surtida: '4.0000',
      }),
    ]);
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await surtirLista.ejecutar(
      ctx,
      entradaSurtirLista.parse({
        listaId: LISTA,
        renglones: [{ renglonId: R_VARILLA, cantidad: '6' }],
      }),
    );

    expect(salida.estado).toBe('surtida');
    expect(base.filas('listas_trabajo')[0]?.['cerrada_en']).toEqual(AHORA);
    expect(renglonDe(base, R_VARILLA)['surtida']).toBe('10');
  });

  it('SIN EXISTENCIA: se marca para el pedido del proveedor y no se abre nota', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await surtirLista.ejecutar(
      ctx,
      entradaSurtirLista.parse({
        listaId: LISTA,
        renglones: [{ renglonId: R_VARILLA, cantidad: null, sinExistencia: true }],
      }),
    );

    expect(salida.notaFolio).toBeNull();
    expect(base.filas('ordenes')).toHaveLength(0);
    expect(renglonDe(base, R_VARILLA)['sin_existencia']).toBe(true);
  });

  it('una lista cerrada no se surte', async () => {
    const base = baseDe('cancelada');
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    await expect(
      surtirLista.ejecutar(
        ctx,
        entradaSurtirLista.parse({
          listaId: LISTA,
          renglones: [{ renglonId: R_VARILLA, cantidad: '1' }],
        }),
      ),
    ).rejects.toMatchObject({ codigo: 'CONFIGURACION_INVALIDA' });
  });

  it('un renglón de OTRA lista contesta como inexistente', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    await expect(
      surtirLista.ejecutar(
        ctx,
        entradaSurtirLista.parse({
          listaId: LISTA,
          renglones: [{ renglonId: 'c0000000-0000-4000-8000-0000000000ff', cantidad: '1' }],
        }),
      ),
    ).rejects.toMatchObject({ codigo: 'PUENTE_NO_ENCONTRADO' });
  });
});

describe('lista_trabajo.renglones', () => {
  it('trae lo que pidió tal cual, con el nombre del producto de lo ya traducido', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await renglonesDeLista.ejecutar(
      ctx,
      entradaRenglonesDeLista.parse({ listaId: LISTA }),
    );

    expect(salida.folio).toBe('LT-7');
    expect(salida.renglones.map((r) => [r.textoPedido, r.productoNombre])).toEqual([
      ['diez de varilla del tres', 'Varilla 3/8'],
      ['cemento del gris', null],
    ]);
  });
});
