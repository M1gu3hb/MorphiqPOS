import { describe, expect, it } from 'vitest';

import {
  globosDeLaMesa,
  MAXIMO_DE_GLOBOS,
  solicitudesPorMesa,
  TIPOS_DE_SOLICITUD,
  type SolicitudPendiente,
} from './globos-de-solicitud.ts';

/**
 * DP-9.2 · LOS GLOBOS DE SOLICITUD SOBRE CADA MESA.
 *
 * Cada solicitud pendiente se ve sobre su mesa, legible de lejos; si una mesa tiene varias, se ven
 * todas: unas cuantas apiladas y el resto en un contador. Lo más viejo, primero: es lo que lleva
 * más tiempo esperando.
 */
const s = (id: string, mesa: string | null, tipo: string, minuto: number): SolicitudPendiente => ({
  id,
  mesa_id: mesa,
  tipo,
  created_date: `2026-10-26T20:${String(minuto).padStart(2, '0')}:00.000Z`,
});

describe('las solicitudes, por mesa', () => {
  it('se agrupan por mesa y, dentro, van de la más vieja a la más nueva', () => {
    const porMesa = solicitudesPorMesa([
      s('b', 'mesa-1', 'cuenta', 10),
      s('a', 'mesa-1', 'ayuda', 5),
      s('c', 'mesa-2', 'ordenar', 7),
    ]);
    expect(porMesa.get('mesa-1')?.map((x) => x.id)).toEqual(['a', 'b']);
    expect(porMesa.get('mesa-2')?.map((x) => x.id)).toEqual(['c']);
  });

  it('sin mesa, o de un tipo que no existe, no hay globo que poner', () => {
    const porMesa = solicitudesPorMesa([s('x', null, 'ayuda', 1), s('y', 'mesa-1', 'otra', 2)]);
    expect(porMesa.size).toBe(0);
  });
});

describe('los globos de una mesa', () => {
  it('unos cuantos apilados y el resto en un contador', () => {
    const muchas = Array.from({ length: MAXIMO_DE_GLOBOS + 2 }, (_, i) =>
      s(String(i), 'mesa-1', 'ayuda', i),
    );
    const { visibles, restantes } = globosDeLaMesa(muchas);
    expect(visibles).toHaveLength(MAXIMO_DE_GLOBOS);
    expect(restantes).toBe(2);
  });

  it('con pocas, todas visibles y sin contador', () => {
    const { visibles, restantes } = globosDeLaMesa([s('a', 'm', 'cuenta', 1)]);
    expect(visibles.map((g) => g.tipo)).toEqual(['cuenta']);
    expect(restantes).toBe(0);
  });
});

describe('cada tipo tiene icono, texto y tono propios', () => {
  it('el color nunca va solo: cada tipo lleva su texto corto y su texto completo', () => {
    const tonos = new Set<string>();
    for (const tipo of Object.values(TIPOS_DE_SOLICITUD)) {
      expect(tipo.corto.length).toBeGreaterThan(2);
      expect(tipo.completo.length).toBeGreaterThan(tipo.corto.length);
      tonos.add(tipo.tono);
    }
    expect(tonos.size).toBe(Object.keys(TIPOS_DE_SOLICITUD).length);
  });
});
