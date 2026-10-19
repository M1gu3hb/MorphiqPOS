import { describe, expect, it } from 'vitest';

import type { HojaDelServidor } from '~/corte/hoja';

import { bebidasDelTurno, cifrasDeCanal, cifrasDeMerma } from './cifras-del-turno.ts';

/**
 * C.9 de la 2.4 · el cierre de turno lee bebidas, canal y merma de la hoja del corte.
 *
 * Se pintaban «—» con el aviso «el puente aún no expone el canal». Ahora salen de la
 * misma hoja que va al PDF. Sólo se arma lo que estas funciones leen.
 */

function hoja(verCostos: boolean): HojaDelServidor {
  return {
    verCostos,
    productos: [
      { nombre: 'Latte', cantidad: '5', familia: 'bebida' },
      { nombre: 'Americano', cantidad: '2', familia: 'bebida' },
      { nombre: 'Croissant', cantidad: '3', familia: 'alimento' },
    ],
    extras: {
      plantilla: 'cafeteria',
      canales: [
        { canal: 'aqui', pedidos: 4, unidades: '6', importeCentavos: '30000' },
        { canal: 'llevar', pedidos: 3, unidades: '4', importeCentavos: '20000' },
      ],
      consumoPorCanal: [
        { canal: 'llevar', insumo: 'Vaso 12 oz', cantidad: '4', unidad: 'pieza' },
        { canal: 'llevar', insumo: 'Leche entera', cantidad: '0.8', unidad: 'l' },
      ],
      mermaDeBarra: [
        {
          motivo: 'Calibración',
          insumo: 'Café en grano',
          cantidad: '0.036',
          unidad: 'kg',
          costoCentavos: '1440',
        },
      ],
    },
  } as unknown as HojaDelServidor;
}

describe('las cifras del turno', () => {
  it('bebidas: sólo lo que el catálogo marca como bebida', () => {
    expect(bebidasDelTurno(hoja(true))).toBe(7);
  });

  it('canal: pedidos, importe y el empaque que salió —el vaso, no la leche—', () => {
    expect(cifrasDeCanal(hoja(true))).toEqual([
      { etiqueta: 'En taza', valor: '4 · $300.00' },
      { etiqueta: 'Para llevar', valor: '3 · $200.00 · 4 de empaque' },
    ]);
  });

  it('merma de barra con su costo sólo para quien lo ve', () => {
    expect(cifrasDeMerma(hoja(true))[0]?.valor).toBe('0.036 kg de Café en grano · $14.40');
    expect(cifrasDeMerma(hoja(false))[0]?.valor).toBe('0.036 kg de Café en grano');
  });
});
