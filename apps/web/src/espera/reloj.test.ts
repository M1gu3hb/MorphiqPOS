import { describe, expect, it } from 'vitest';

import { desplazamientoContraQuemado, horaYFecha } from './reloj';

/**
 * DP-11.2 · LA HORA DEL MODO ESPERA: grande, en la zona del negocio (no la del aparato), y que
 * se mueve muy despacio para no quemar la pantalla.
 */
describe('horaYFecha', () => {
  it('en la zona del negocio, con hora de 12 y su fecha en español', () => {
    // 22:05 UTC del 29-10-2026 son las 4:05 p. m. en la Ciudad de México.
    const { hora, meridiano, fecha } = horaYFecha(
      new Date('2026-10-29T22:05:00Z'),
      'America/Mexico_City',
    );
    expect(hora).toBe('4:05');
    expect(meridiano).toMatch(/p\.\s?m\./);
    expect(fecha).toBe('jueves, 29 de octubre');
  });

  it('la zona es la que se le da, no la del aparato que corre la prueba', () => {
    // El mismo instante, en otras dos zonas: ni la hora ni la fecha son las de México.
    const instante = new Date('2026-10-29T22:05:00Z');
    expect(horaYFecha(instante, 'UTC')).toMatchObject({
      hora: '10:05',
      fecha: 'jueves, 29 de octubre',
    });
    const tokio = horaYFecha(instante, 'Asia/Tokyo');
    expect(tokio).toMatchObject({ hora: '7:05', fecha: 'viernes, 30 de octubre' });
    expect(tokio.meridiano).toMatch(/a\.\s?m\./);
  });

  it('la medianoche es «12», no «0»', () => {
    expect(horaYFecha(new Date('2026-10-30T06:00:00Z'), 'America/Mexico_City').hora).toBe('12:00');
  });
});

describe('desplazamientoContraQuemado', () => {
  it('se mueve despacio dentro de su margen y vuelve a pasar por el centro', () => {
    const margen = 24;
    const posiciones = Array.from({ length: 120 }, (_, i) =>
      desplazamientoContraQuemado(i * 60_000, margen),
    );
    for (const { x, y } of posiciones) {
      expect(Math.abs(x)).toBeLessThanOrEqual(margen);
      expect(Math.abs(y)).toBeLessThanOrEqual(margen);
    }
    // De un minuto al siguiente se mueve poco: nada que se note como salto.
    for (let i = 1; i < posiciones.length; i += 1) {
      const a = posiciones[i - 1]!;
      const b = posiciones[i]!;
      expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeLessThan(margen / 3);
    }
    // Y en dos horas recorre su margen (no se queda quieta en un punto).
    const xs = posiciones.map((p) => p.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(margen);
  });
});
