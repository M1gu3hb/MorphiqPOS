import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import { contextoFalso, crearBaseFalsa } from '../restaurante/pruebas/base-falsa.ts';
import { ambitoDe, ORG, PRODUCTO } from '../restaurante/pruebas/sala.ts';
import { aplicarPrecioSugerido } from './precio-sugerido.ts';

/**
 * El precio que sube cuando sube el costo.
 *
 * ── Qué defiende esta prueba ─────────────────────────────────────────────
 * Que aplicar una sugerencia toque UNA columna. El comando general de precios
 * reescribe el bloque entero —venta, costo, mayoreo con su mínimo— y la pantalla
 * de entradas sólo tiene el precio de venta sugerido: si esto usara ese comando,
 * aceptar una sugerencia borraría el precio de mayoreo del cobre.
 *
 * Y que un material de OTRO NEGOCIO responda igual que uno inexistente: con el
 * mensaje distinto, un identificador ajeno serviría para sondear el catálogo de
 * al lado.
 */

const AHORA = new Date('2026-09-19T18:00:00.000Z');
const OTRA_ORG = 'a9999999-9999-4999-8999-999999999999';

function baseDe(organizacionId = ORG) {
  return crearBaseFalsa({
    productos: [
      {
        id: PRODUCTO,
        organizacion_id: organizacionId,
        nombre: 'Cable THW calibre 12',
        precio_venta_centavos: 1_890n,
        precio_mayoreo_centavos: 1_700n,
        cantidad_minima_mayoreo: '50',
        costo_unitario_centavos: 1_240n,
      },
    ],
  });
}

describe('el precio sugerido de una entrada', () => {
  it('SUBE EL DE VENTA Y DEJA EL MAYOREO donde estaba', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    const salida = await aplicarPrecioSugerido.ejecutar(ctx, {
      materialId: PRODUCTO,
      precioCentavos: 2_150,
    });

    expect(salida.precioAnteriorCentavos).toBe('1890');
    expect(base.campo('productos', 'precio_venta_centavos')).toBe(2_150n);
    // Lo que NO se toca. Con el comando general de precios, estos dos se irían.
    expect(base.campo('productos', 'precio_mayoreo_centavos')).toBe(1_700n);
    expect(base.campo('productos', 'cantidad_minima_mayoreo')).toBe('50');
    // Y el costo lo escribe la recepción de la nota, que es donde se supo.
    expect(base.campo('productos', 'costo_unitario_centavos')).toBe(1_240n);
  });

  it('UN MATERIAL DE OTRO NEGOCIO no existe', async () => {
    const base = baseDe(OTRA_ORG);
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    const fallo = await aplicarPrecioSugerido
      .ejecutar(ctx, { materialId: PRODUCTO, precioCentavos: 2_150 })
      .catch((e: unknown) => e);

    expect(esErrorDominio(fallo) && fallo.codigo).toBe('PRODUCTO_NO_ENCONTRADO');
    // Y no se escribe nada en el catálogo ajeno.
    expect(base.campo('productos', 'precio_venta_centavos')).toBe(1_890n);
  });
});
