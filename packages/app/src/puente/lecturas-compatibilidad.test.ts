import { describe, expect, it } from 'vitest';

import { calcular } from './consultar.ts';
import { entidadMapeada } from './mapa.ts';

describe('alias de lectura que consume la interfaz heredada', () => {
  it('expone las fechas de creación con los nombres de cada entidad', () => {
    expect(entidadMapeada('Venta')?.calculados?.['fecha_apertura']).toMatchObject({
      formula: 'fechaDeCreacion',
      conversion: 'fecha',
    });
    for (const entidad of ['PedidoPreparacion', 'SolicitudQR']) {
      expect(entidadMapeada(entidad)?.calculados?.['fecha_creacion'], entidad).toMatchObject({
        formula: 'fechaDeCreacion',
        conversion: 'fecha',
      });
    }
    expect(calcular('fechaDeCreacion', { created_date: new Date('2026-09-13T12:00:00Z') })).toBe(
      '2026-09-13T12:00:00.000Z',
    );
  });

  it('deriva la etiqueta y el origen de la satisfacción sin duplicarlos en la base', () => {
    const venta = entidadMapeada('Venta');
    expect(venta?.calculados?.['satisfaccion_label']).toMatchObject({
      formula: 'etiquetaSatisfaccion',
    });
    expect(venta?.campos['satisfaccion_origen']).toMatchObject({ constante: 'portal_qr' });
    expect(calcular('etiquetaSatisfaccion', { satisfaccion_score: 1 })).toBe('Muy mala');
    expect(calcular('etiquetaSatisfaccion', { satisfaccion_score: 5 })).toBe('Excelente');
    expect(calcular('etiquetaSatisfaccion', { satisfaccion_score: null })).toBeNull();
  });
});
