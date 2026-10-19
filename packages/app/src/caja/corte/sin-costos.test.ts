import { describe, expect, it } from 'vitest';

import { sinCostosSiNoLosVe } from './sin-costos.ts';

/**
 * El corte para quien no ve costos (auditoría de la 2.4): ni uno solo en la respuesta,
 * a cualquier profundidad, y nada más tocado.
 */

const HOJA = {
  verCostos: false,
  resumen: { totalCentavos: '50000', costoCentavos: '20000' },
  productos: [
    { nombre: 'Latte', totalCentavos: '6500', costoCentavos: '1800', margenObjetivoBp: 7000 },
  ],
  extras: {
    plantilla: 'cafeteria',
    mermaDeBarra: [{ insumo: 'Leche', costoCentavos: '900' }],
    sellos: { canjes: 2, costoCanjesCentavos: '3600', costoPremioCentavos: '1800' },
    garantias: [{ producto: 'Taladro', costoCentavos: '120000', dias: 40 }],
  },
  sesion: { abiertaEn: new Date('2026-09-26T14:00:00.000Z') },
} as const;

describe('el corte sin costos', () => {
  it('quita TODO costo y todo margen, en cualquier sección y a cualquier profundidad', () => {
    const limpia = sinCostosSiNoLosVe(HOJA, false);
    const texto = JSON.stringify(limpia);

    expect(texto).not.toContain('20000');
    expect(texto).not.toContain('1800');
    expect(texto).not.toContain('7000');
    expect(texto).not.toContain('900');
    expect(texto).not.toContain('3600');
    expect(texto).not.toContain('120000');
    expect(limpia.extras.sellos.costoCanjesCentavos).toBeNull();
    expect(limpia.productos[0]?.margenObjetivoBp).toBeNull();
  });

  it('lo que no es costo queda igual, fechas incluidas', () => {
    const limpia = sinCostosSiNoLosVe(HOJA, false);

    expect(limpia.resumen.totalCentavos).toBe('50000');
    expect(limpia.extras.sellos.canjes).toBe(2);
    expect(limpia.extras.garantias[0]?.dias).toBe(40);
    expect(limpia.sesion.abiertaEn).toBeInstanceOf(Date);
    expect(limpia.verCostos).toBe(false);
  });

  it('quien sí ve costos recibe el documento tal cual', () => {
    expect(sinCostosSiNoLosVe(HOJA, true)).toBe(HOJA);
  });
});
