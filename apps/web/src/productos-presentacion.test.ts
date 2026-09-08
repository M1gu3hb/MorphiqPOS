import { describe, expect, it } from 'vitest';

import {
  coincideBusqueda,
  etiquetaTipoVenta,
  pesosDesdeCentavos,
} from '../app/(gestion)/productos/presentacion';

describe('B-06 · presentación de productos', () => {
  it('formatea centavos sin punto flotante', () => {
    expect(pesosDesdeCentavos('164990')).toBe('$1,649.90');
    expect(pesosDesdeCentavos('5')).toBe('$0.05');
    expect(pesosDesdeCentavos('-125')).toBe('-$1.25');
  });

  it('da nombres claros a los cuatro tipos de venta', () => {
    expect(etiquetaTipoVenta('precio_fijo')).toBe('Precio fijo');
    expect(etiquetaTipoVenta('variable_medida')).toBe('Peso o medida');
    expect(etiquetaTipoVenta('porcion_contenedor')).toBe('Porción');
    expect(etiquetaTipoVenta('servicio')).toBe('Servicio');
  });

  it('tolera un error de captura en el nombre', () => {
    expect(coincideBusqueda('Taladro percutor', 'taladro')).toBe(true);
    expect(coincideBusqueda('Tornillo punta broca', 'tornilo')).toBe(true);
    expect(coincideBusqueda('Martillo de uña', 'cafetera')).toBe(false);
  });
});
