import { describe, expect, it } from 'vitest';

import type { SolicitudPendiente } from './globos-de-solicitud.ts';
import {
  CLAVE_DE_LA_VISTA,
  guardarVista,
  haceCuanto,
  leerVistaGuardada,
  nuevasParaAnunciar,
  solicitudesEnOrden,
} from './vista-de-solicitudes.ts';

/**
 * DP-9.3 · LA VISTA «SOLICITUDES» DENTRO DE MESAS.
 *
 * La lista va de la mesa que más lleva esperando a la más nueva, dice hace cuánto pidió, y la voz
 * anuncia cada solicitud UNA vez. La vista se recuerda en el aparato: así un aparato se queda de
 * estación.
 */
const AHORA = Date.parse('2026-10-26T21:00:00.000Z');
const s = (id: string, tipo: string, minuto: number): SolicitudPendiente => ({
  id,
  mesa_id: `mesa-${id}`,
  tipo,
  created_date: `2026-10-26T20:${String(minuto).padStart(2, '0')}:00.000Z`,
});

function almacen(inicial: Record<string, string> = {}) {
  const datos = new Map(Object.entries(inicial));
  return {
    getItem: (k: string) => datos.get(k) ?? null,
    setItem: (k: string, v: string) => {
      datos.set(k, v);
    },
    datos,
  };
}

describe('hace cuánto pidió la mesa', () => {
  it('en minutos, y en horas cuando pasa de una', () => {
    expect(haceCuanto('2026-10-26T20:59:40.000Z', AHORA)).toBe('hace un momento');
    expect(haceCuanto('2026-10-26T20:56:00.000Z', AHORA)).toBe('hace 4 min');
    expect(haceCuanto('2026-10-26T19:55:00.000Z', AHORA)).toBe('hace 1 h 5 min');
    expect(haceCuanto('2026-10-26T19:00:00.000Z', AHORA)).toBe('hace 2 h');
  });

  it('sin fecha, o con un reloj adelantado, no inventa un tiempo negativo', () => {
    expect(haceCuanto(null, AHORA)).toBe('');
    expect(haceCuanto('no es fecha', AHORA)).toBe('');
    expect(haceCuanto('2026-10-26T21:03:00.000Z', AHORA)).toBe('hace un momento');
  });
});

describe('la lista de solicitudes', () => {
  it('primero la que lleva más tiempo esperando, y sin tipos que no existen', () => {
    const lista = solicitudesEnOrden([
      s('b', 'cuenta', 30),
      s('x', 'otra', 1),
      s('a', 'ayuda', 10),
    ]);
    expect(lista.map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('la voz anuncia sólo las que no había anunciado', () => {
    const todas = [s('a', 'ayuda', 10), s('b', 'cuenta', 30), s('c', 'ordenar', 20)];
    expect(nuevasParaAnunciar(todas, new Set(['a'])).map((x) => x.id)).toEqual(['c', 'b']);
    expect(nuevasParaAnunciar(todas, new Set(['a', 'b', 'c']))).toEqual([]);
  });
});

describe('la vista se recuerda en el aparato', () => {
  it('lo que guardó es lo que abre la próxima vez', () => {
    const local = almacen();
    expect(leerVistaGuardada(local)).toBe('mesas');
    expect(guardarVista(local, 'solicitudes')).toBe(true);
    expect(local.datos.get(CLAVE_DE_LA_VISTA)).toBe('solicitudes');
    expect(leerVistaGuardada(local)).toBe('solicitudes');
  });

  it('un valor raro, un almacén ausente o bloqueado abren en Mesas sin romper', () => {
    expect(leerVistaGuardada(almacen({ [CLAVE_DE_LA_VISTA]: 'cocina' }))).toBe('mesas');
    expect(leerVistaGuardada(null)).toBe('mesas');
    const bloqueado = {
      getItem: (): string | null => {
        throw new Error('SecurityError');
      },
      setItem: (): void => {
        throw new Error('QuotaExceededError');
      },
    };
    expect(leerVistaGuardada(bloqueado)).toBe('mesas');
    expect(guardarVista(bloqueado, 'solicitudes')).toBe(false);
    expect(guardarVista(null, 'solicitudes')).toBe(false);
  });
});
