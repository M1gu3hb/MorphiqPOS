import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import {
  contextoFalso,
  crearBaseFalsa,
  type TablasFalsas,
} from '../restaurante/pruebas/base-falsa.ts';
import { ambitoDe, ORG } from '../restaurante/pruebas/sala.ts';
import { abrirPieza, marcarRetazo, piezasDeProducto } from './pieza-abierta.ts';

/**
 * F-145 · El rollo abierto.
 *
 * ── Lo que estas pruebas defienden ───────────────────────────────────────
 * Que abrir una pieza NO MUEVA STOCK. El rollo ya estaba contado: abrirlo sólo
 * dice cómo está repartido. Un movimiento aquí lo descontaría dos veces, una al
 * abrirlo y otra al cortarlo, y el inventario de cable quedaría a la mitad.
 *
 * Que se recomiende LA MÁS CHICA QUE ALCANCE. Cortar del rollo grande deja tres
 * retazos del mismo cable: el trabajo de una ferretería es acabarse los
 * abiertos, no abrir otro.
 *
 * Y que dos rollos no compartan rótulo. El corte se descontaría del rollo
 * equivocado y nadie lo nota hasta que uno de los dos se acaba antes.
 */

const AHORA = new Date('2026-09-16T12:00:00.000Z');
const CABLE = 'f1000000-0000-4000-8000-00000000000b';
const ALMACEN = 'f2000000-0000-4000-8000-000000000001';

const dias = (n: number) => new Date(AHORA.getTime() + n * 86_400_000);

function pieza(cambios: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'p1',
    organizacion_id: ORG,
    producto_id: CABLE,
    almacen_id: ALMACEN,
    folio: 'R-114',
    // En micrómetros: 25 metros.
    medida_restante_base: 25_000_000n,
    estado: 'abierta',
    precio_remate_centavos: null,
    ubicacion_id: null,
    abierta_en: dias(-10),
    ...cambios,
  };
}

function baseDe(extra: Partial<TablasFalsas> = {}) {
  return crearBaseFalsa(
    {
      productos: [
        { id: CABLE, organizacion_id: ORG, nombre: 'Cable THW cal 12', es_continuo: true },
      ],
      piezas_abiertas: [],
      movimientos_stock: [],
      ...extra,
    },
    {
      predeterminados: {
        piezas_abiertas: {
          precio_remate_centavos: null,
          ubicacion_id: null,
          cerrada_en: null,
          movimiento_cierre_id: null,
        },
      },
    },
  );
}

async function codigoDe(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return 'NO LANZÓ';
  } catch (error) {
    return esErrorDominio(error) ? error.codigo : `INESPERADO: ${String(error)}`;
  }
}

describe('F-145 · abrir una pieza', () => {
  it('ABRIR NO MUEVE STOCK', async () => {
    // El rollo ya estaba contado. Un movimiento aquí lo descontaría dos veces.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    await abrirPieza.ejecutar(ctx, {
      productoId: CABLE,
      almacenId: ALMACEN,
      medidaBase: '25000000',
      folio: 'R-115',
      ubicacionId: null,
    });

    expect(base.filas('piezas_abiertas')).toHaveLength(1);
    expect(base.filas('movimientos_stock')).toHaveLength(0);
  });

  it('DOS ROLLOS NO COMPARTEN RÓTULO', async () => {
    // El corte se descontaría del rollo equivocado.
    const base = baseDe({ piezas_abiertas: [pieza()] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const codigo = await codigoDe(() =>
      abrirPieza.ejecutar(ctx, {
        productoId: CABLE,
        almacenId: ALMACEN,
        medidaBase: '10000000',
        folio: 'R-114',
        ubicacionId: null,
      }),
    );

    expect(codigo).toBe('CONFIGURACION_CONFLICTO');
    expect(base.filas('piezas_abiertas')).toHaveLength(1);
  });

  it('lo que NO se vende por medida no tiene pieza que abrir', async () => {
    const base = baseDe({
      productos: [{ id: CABLE, organizacion_id: ORG, nombre: 'Taladro', es_continuo: false }],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const codigo = await codigoDe(() =>
      abrirPieza.ejecutar(ctx, {
        productoId: CABLE,
        almacenId: ALMACEN,
        medidaBase: '25000000',
        folio: 'R-200',
        ubicacionId: null,
      }),
    );

    expect(codigo).toBe('CONFIGURACION_CONFLICTO');
  });

  it('una pieza SIN MATERIAL no está abierta', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const codigo = await codigoDe(() =>
      abrirPieza.ejecutar(ctx, {
        productoId: CABLE,
        almacenId: ALMACEN,
        medidaBase: '0',
        folio: 'R-300',
        ubicacionId: null,
      }),
    );

    expect(codigo).toBe('CANTIDAD_INVALIDA');
  });
});

describe('F-145 · qué hay abierto', () => {
  it('RECOMIENDA LA MÁS CHICA QUE ALCANZA', async () => {
    // Cortar del rollo grande deja tres retazos del mismo cable.
    const base = baseDe({
      piezas_abiertas: [
        pieza({ id: 'chica', folio: 'R-1', medida_restante_base: 3_000_000n }),
        pieza({ id: 'mediana', folio: 'R-2', medida_restante_base: 12_000_000n }),
        pieza({ id: 'grande', folio: 'R-3', medida_restante_base: 25_000_000n }),
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await piezasDeProducto.ejecutar(ctx, {
      productoId: CABLE,
      necesitaBase: '10000000',
    });

    expect(salida.recomendada).toBe('mediana');
  });

  it('si ninguna alcanza lo dice, y no devuelve la primera', async () => {
    const base = baseDe({
      piezas_abiertas: [pieza({ id: 'chica', medida_restante_base: 3_000_000n })],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await piezasDeProducto.ejecutar(ctx, {
      productoId: CABLE,
      necesitaBase: '10000000',
    });

    expect(salida.recomendada).toBeNull();
    expect(salida.piezas[0]?.alcanza).toBe(false);
  });

  it('suma lo abierto y dice cuánto lleva cada una', async () => {
    // Los rollos abiertos hace meses son la alerta que evita acumular tres
    // retazos del mismo cable.
    const base = baseDe({
      piezas_abiertas: [
        pieza({ id: 'p1', folio: 'R-1', medida_restante_base: 3_000_000n, abierta_en: dias(-120) }),
        pieza({ id: 'p2', folio: 'R-2', medida_restante_base: 7_000_000n }),
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await piezasDeProducto.ejecutar(ctx, { productoId: CABLE, necesitaBase: null });

    expect(salida.totalAbiertoBase).toBe('10000000');
    expect(salida.piezas[0]?.diasAbierta).toBe(120);
  });

  it('las CERRADAS no salen', async () => {
    const base = baseDe({
      piezas_abiertas: [
        pieza({ id: 'viva' }),
        pieza({ id: 'muerta', folio: 'R-9', estado: 'cerrada', cerrada_en: dias(-1) }),
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await piezasDeProducto.ejecutar(ctx, { productoId: CABLE, necesitaBase: null });

    expect(salida.piezas.map((p) => p.piezaId)).toEqual(['viva']);
  });
});

describe('F-145 · el retazo', () => {
  it('el precio de remate vive EN LA PIEZA, no en el catálogo', async () => {
    // Ponerlo en el producto haría que el rollo entero se vendiera barato.
    const base = baseDe({ piezas_abiertas: [pieza()] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await marcarRetazo.ejecutar(ctx, {
      piezaId: 'p1',
      precioRemateCentavos: 5_000,
    });

    expect(salida.estado).toBe('retazo');
    expect(base.campo('piezas_abiertas', 'precio_remate_centavos')).toBe(5_000n);
  });

  it('una pieza ya rematada no se remata dos veces', async () => {
    const base = baseDe({
      piezas_abiertas: [pieza({ estado: 'retazo', precio_remate_centavos: 5_000n })],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const codigo = await codigoDe(() =>
      marcarRetazo.ejecutar(ctx, { piezaId: 'p1', precioRemateCentavos: 3_000 }),
    );

    expect(codigo).toBe('CONFIGURACION_CONFLICTO');
  });

  it('una pieza de otro negocio no existe', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const codigo = await codigoDe(() =>
      marcarRetazo.ejecutar(ctx, { piezaId: 'p1', precioRemateCentavos: 3_000 }),
    );

    expect(codigo).toBe('PUENTE_NO_ENCONTRADO');
  });
});
