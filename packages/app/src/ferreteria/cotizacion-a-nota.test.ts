import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import { contextoFalso, crearBaseFalsa, type Fila } from '../restaurante/pruebas/base-falsa.ts';
import { ambitoDe, ORG, SUCURSAL } from '../restaurante/pruebas/sala.ts';
import { convertirCotizacionEnNota } from './cotizacion-a-nota.ts';

/**
 * F-604 · LA COTIZACIÓN GANADA SE CONVIERTE EN VENTA (bloque D de la 2.4).
 *
 * «Convertir en venta o pedido» no tenía nada detrás y `cotizacion.convertir` pedía una
 * orden que ya existiera: lo cotizado no llegaba a la caja por ningún camino. Ahora se abre
 * como nota de mostrador —con su folio `N-…`— al PRECIO COTIZADO, que es lo que se honra
 * mientras la cotización viva, y la cotización queda ganada con esa orden.
 */

const AHORA = new Date('2026-10-08T18:00:00.000Z');
const COTIZACION = 'c0000000-0000-4000-8000-000000000001';
const BROCHA = 'b1111111-1111-4111-8111-111111111111';
const THINNER = 'b2222222-2222-4222-8222-222222222222';

function material(id: string, nombre: string, precio: bigint): Fila {
  return {
    id,
    organizacion_id: ORG,
    nombre,
    sku: null,
    codigo_barras: null,
    tipo_venta: 'precio_fijo',
    unidad_venta: 'pieza',
    precio_venta_centavos: precio,
    costo_unitario_centavos: precio / 2n,
    estrategia_consumo: 'sku',
    permite_venta_sin_stock: true,
    activo: true,
  };
}

function linea(cambios: Fila = {}): Fila {
  return {
    id: 'a0000000-0000-4000-8000-000000000001',
    organizacion_id: ORG,
    cotizacion_id: COTIZACION,
    orden_visual: 0,
    producto_id: BROCHA,
    descripcion: 'Brocha profesional 3 pulgadas',
    cantidad: '2.0000',
    unidad: 'pieza',
    // Cotizada a $75 cuando el catálogo dice $79: se honra lo cotizado.
    precio_unitario_centavos: 7_500n,
    total_centavos: 15_000n,
    ...cambios,
  };
}

function baseDe(cotizacion: Fila = {}, lineas: readonly Fila[] = [linea()]) {
  return crearBaseFalsa(
    {
      cotizaciones: [
        {
          id: COTIZACION,
          organizacion_id: ORG,
          sucursal_id: SUCURSAL,
          folio: 'C-7',
          version: 1,
          estado: 'enviada',
          vence_el: '2026-10-23',
          cliente_id: null,
          obra_id: null,
          nombre_libre: 'Ing. Loera',
          correo_libre: null,
          telefono_libre: null,
          descuento_centavos: 0n,
          orden_id: null,
          cerrada_en: null,
          ...cotizacion,
        },
      ],
      cotizacion_lineas: [...lineas],
      cotizacion_eventos: [],
      productos: [
        material(BROCHA, 'Brocha profesional 3 pulgadas', 7_900n),
        material(THINNER, 'Thinner estándar 1 L', 9_500n),
      ],
      ordenes: [],
      notas_mostrador: [],
      orden_lineas: [],
      configuracion: [],
    },
    {
      filasCrudas: [{ siguiente: 12n, serie: 'N' }],
      predeterminados: {
        ordenes: { estado: 'borrador', total_centavos: 0n },
        orden_lineas: {
          descuento_centavos: 0n,
          impuesto_centavos: 0n,
          notas: null,
          opciones: null,
          anulada_en: null,
        },
        cotizacion_eventos: { medio: null, nota: null, empleado_id: null },
      },
    },
  );
}

async function codigoDe(promesa: Promise<unknown>): Promise<string> {
  return promesa
    .then(() => 'NO_LANZO')
    .catch((error: unknown) => (esErrorDominio(error) ? error.codigo : String(error)));
}

describe('cotizacion.convertir_en_nota', () => {
  it('la cotización ganada llega a la caja como nota, al PRECIO COTIZADO', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await convertirCotizacionEnNota.ejecutar(ctx, { cotizacionId: COTIZACION });

    expect(salida.folio).toBe('N-12');
    expect(salida.totalCentavos).toBe('15000');
    expect(base.campo('orden_lineas', 'precio_unitario_centavos')).toBe(7_500n);
    expect(base.campo('ordenes', 'total_centavos')).toBe(15_000n);
    // La nota, para la caja: por cobrar y a nombre de quien se cotizó.
    expect(base.campo('notas_mostrador', 'estado')).toBe('por_cobrar');
    expect(base.campo('notas_mostrador', 'nombre_libre')).toBe('Ing. Loera');
    // Y la cotización, ganada CON su orden.
    expect(base.campo('cotizaciones', 'estado')).toBe('ganada');
    expect(base.campo('cotizaciones', 'orden_id')).toBe(salida.ordenId);
  });

  it('el descuento de la cotización entera se reparte: la caja cobra el total cotizado', async () => {
    const base = baseDe({ descuento_centavos: 2_450n }, [
      linea(),
      linea({
        id: 'a0000000-0000-4000-8000-000000000002',
        orden_visual: 1,
        producto_id: THINNER,
        descripcion: 'Thinner estándar 1 L',
        cantidad: '1.0000',
        precio_unitario_centavos: 9_500n,
        total_centavos: 9_500n,
      }),
    ]);
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await convertirCotizacionEnNota.ejecutar(ctx, { cotizacionId: COTIZACION });

    // $150 + $95 − $24.50 = $220.50.
    expect(salida.totalCentavos).toBe('22050');
    const descuentos = base.filas('orden_lineas').map((l) => l['descuento_centavos'] as bigint);
    expect(descuentos.reduce((s, d) => s + d, 0n)).toBe(2_450n);
    // Y cada partida dice lo que se cobra por ella: la caja la enseña así y la devolución
    // devuelve eso, no el precio sin descuento.
    for (const linea of base.filas('orden_lineas')) {
      expect(linea['total_centavos']).toBe(
        (linea['subtotal_centavos'] as bigint) - (linea['descuento_centavos'] as bigint),
      );
    }
  });

  it('una cotización vencida no se convierte, y no abre ninguna nota', async () => {
    const base = baseDe({ vence_el: '2026-10-01' });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    expect(
      await codigoDe(convertirCotizacionEnNota.ejecutar(ctx, { cotizacionId: COTIZACION })),
    ).toBe('CONFIGURACION_CONFLICTO');
    expect(base.filas('notas_mostrador')).toHaveLength(0);
  });

  it('una que no se mandó —o ya se cerró— no se convierte', async () => {
    for (const estado of ['borrador', 'ganada', 'perdida']) {
      const base = baseDe({ estado });
      const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);
      expect(
        await codigoDe(convertirCotizacionEnNota.ejecutar(ctx, { cotizacionId: COTIZACION })),
      ).toBe('CONFIGURACION_CONFLICTO');
      expect(base.filas('notas_mostrador')).toHaveLength(0);
    }
  });

  it('una partida escrita a mano no entra a la caja: se dice cuál', async () => {
    const base = baseDe({}, [linea({ producto_id: null, descripcion: 'Flete a la obra' })]);
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const fallo = await convertirCotizacionEnNota
      .ejecutar(ctx, { cotizacionId: COTIZACION })
      .catch((e: unknown) => e);

    expect(esErrorDominio(fallo) ? fallo.codigo : null).toBe('PRODUCTO_NO_ENCONTRADO');
    expect(esErrorDominio(fallo) ? fallo.message : '').toContain('Flete a la obra');
  });
});
