import { describe, expect, it } from 'vitest';

import { contextoFalso, crearBaseFalsa, type Fila } from '../restaurante/pruebas/base-falsa.ts';
import { ambitoDe, ORG } from '../restaurante/pruebas/sala.ts';
import { crearNotaMostrador, entradaCrearNotaMostrador } from './nota-de-mostrador.ts';

/**
 * `ferreteria.crear_nota_mostrador` · la nota que el mostrador manda a la caja.
 *
 * No tenía pruebas. Éstas defienden lo que la 2.4 le añadió (C.10): que una partida
 * con PRESENTACIÓN —la caja que la ficha eligió— entre como caja, con su precio, y no
 * como piezas sueltas al precio de la pieza.
 */

const AHORA = new Date('2026-09-19T17:00:00.000Z');
const PIEZA = 'b1111111-1111-4111-8111-111111111111';
const CAJA = 'c1111111-1111-4111-8111-111111111111';

function pieza(extra: Fila = {}): Fila {
  return {
    id: PIEZA,
    organizacion_id: ORG,
    nombre: 'Tornillo tirafondo 1/4 × 2',
    sku: 'TIR-14X2',
    codigo_barras: null,
    tipo_venta: 'precio_fijo',
    unidad_venta: 'pieza',
    precio_venta_centavos: 350n,
    costo_unitario_centavos: 180n,
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
    unidad_base: 'pieza',
    ...extra,
  };
}

function baseDe() {
  return crearBaseFalsa(
    {
      productos: [pieza()],
      producto_presentaciones: [
        {
          id: CAJA,
          organizacion_id: ORG,
          producto_id: PIEZA,
          nombre: 'Caja',
          factor: '100.0000',
          precio_venta_centavos: 30_000n,
          codigo_barras: null,
          activa: true,
        },
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

describe('ferreteria.crear_nota_mostrador', () => {
  it('LA CAJA ENTRA COMO CAJA: con su precio, no cien piezas al precio de la pieza', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    await crearNotaMostrador.ejecutar(
      ctx,
      entradaCrearNotaMostrador.parse({
        partidas: [
          { productoId: PIEZA, cantidad: '1', presentacionId: CAJA },
          { productoId: PIEZA, cantidad: '4' },
        ],
      }),
    );

    const lineas = base.filas('orden_lineas');
    expect(lineas.map((l) => l['subtotal_centavos'])).toEqual([30_000n, 1_400n]);
  });

  it('una presentación que no es de la pieza no entra', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    await expect(
      crearNotaMostrador.ejecutar(
        ctx,
        entradaCrearNotaMostrador.parse({
          partidas: [
            {
              productoId: PIEZA,
              cantidad: '1',
              presentacionId: 'd1111111-1111-4111-8111-111111111111',
            },
          ],
        }),
      ),
    ).rejects.toMatchObject({ codigo: 'PRODUCTO_NO_ENCONTRADO' });
  });
});
