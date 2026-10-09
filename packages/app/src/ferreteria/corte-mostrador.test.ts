import type { repoVentaCatalogo } from '@morphiqpos/data';
import { describe, expect, it } from 'vitest';

import { valorarLinea } from '../venta/valorar.ts';
import { precioDeLaPieza } from './corte-mostrador.ts';

/**
 * El retazo se cobra a su precio de REMATE (C.10 de la 2.4).
 *
 * `inventario.marcar_retazo` guardaba el precio y ningún cobro lo leía: el pedazo de
 * 6.80 m que alguien rebajó para que saliera se cobraba a precio de lista y se
 * quedaba en el rack.
 */

const CABLE: repoVentaCatalogo.ProductoParaVender = {
  id: 'b0000000-0000-4000-8000-000000000020',
  nombre: 'Cable THW calibre 12',
  sku: null,
  codigoBarras: null,
  tipoVenta: 'precio_fijo',
  unidadVenta: 'm',
  precioVentaCentavos: 1_800n,
  costoUnitarioCentavos: 900n,
  precioMayoreoCentavos: 1_500n,
  cantidadMinimaMayoreo: '50',
  unidadVariable: null,
  precioPorUnidadVariableCentavos: null,
  cantidadMinimaVariable: null,
  cantidadMaximaVariable: null,
  incrementoVariable: null,
  capacidadContenedorMl: null,
  mlPorPorcion: null,
  porcionesPorContenedor: null,
  precioPorPorcionCentavos: null,
  estrategiaConsumo: 'sku',
  permiteVentaSinStock: false,
  insumoId: 'c0000000-0000-4000-8000-000000000020',
  unidadBaseInsumo: 'm',
};

describe('el precio de la pieza de la que se corta', () => {
  it('UN RETAZO CON REMATE se cobra al remate: 6.8 m × $9.00 = $61.20', () => {
    const producto = precioDeLaPieza(CABLE, { estado: 'retazo', precioRemate: 900n });
    expect(valorarLinea(producto, '6.8', undefined).precio.subtotalCentavos).toBe(6_120n);
  });

  it('un rollo abierto se cobra a precio de lista', () => {
    const producto = precioDeLaPieza(CABLE, { estado: 'abierta', precioRemate: null });
    expect(valorarLinea(producto, '6.8', undefined).precio.subtotalCentavos).toBe(12_240n);
  });

  it('un retazo SIN precio marcado sigue a precio de lista', () => {
    const producto = precioDeLaPieza(CABLE, { estado: 'retazo', precioRemate: null });
    expect(producto).toBe(CABLE);
  });

  it('el remate no se combina con el mayoreo', () => {
    const producto = precioDeLaPieza(CABLE, { estado: 'retazo', precioRemate: 900n });
    expect(valorarLinea(producto, '60', undefined).precio.subtotalCentavos).toBe(54_000n);
  });
});
