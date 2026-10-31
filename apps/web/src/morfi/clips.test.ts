import { describe, expect, it } from 'vitest';

import { CLIPS, cajaEnElEscenario, formatoParaElNavegador, rutasDe, sobreLaTarjeta } from './clips';

/**
 * MORFI EN EL POS (DP-11.1): los tres clips aprobados, dónde van y en qué formato.
 *
 * Los números salen de `ux-pos/videos/escenas.json` y `solo-morfi-recorte/recortes.json` de
 * `M1gu3hb/Morfi-pet` en `c61aab2`: el recorte de cada clip, la orilla detrás de la que se
 * asoma y la tarjeta de la escena, en el cuadro de 1920 × 1080.
 */

describe('«Cargando»: Morfi asomado detrás de la tarjeta', () => {
  const escena = CLIPS.cargando.escena;
  const p = sobreLaTarjeta(escena);

  it('sus manos quedan EXACTO en la orilla de la tarjeta', () => {
    // Con la tarjeta de 560 de la escena, el clip mide lo que mide el recorte y su orilla cae
    // donde la escena dice: a `orillaY - tarjeta.y` del borde de arriba de la tarjeta.
    const alto = p.ancho * escena.tarjeta.ancho * (escena.recorte.alto / escena.recorte.ancho);
    const arribaDelClip = -(1 - p.bajaDeLaOrilla) * alto;
    const orillaEnElClip = ((escena.orillaY - escena.recorte.y) / escena.recorte.alto) * alto;
    expect(arribaDelClip + orillaEnElClip).toBeCloseTo(escena.orillaY - escena.tarjeta.y, 6);
    expect(p.izquierda * escena.tarjeta.ancho).toBeCloseTo(escena.recorte.x - escena.tarjeta.x, 6);
    expect(p.ancho * escena.tarjeta.ancho).toBeCloseTo(escena.recorte.ancho, 6);
  });

  it('el texto empieza debajo de sus manos', () => {
    const debajo = escena.recorte.y + escena.recorte.alto - escena.tarjeta.y;
    expect(p.solape * escena.tarjeta.ancho).toBeCloseTo(debajo, 6);
    expect(p.solape).toBeGreaterThan(0);
  });

  it('es un bucle', () => {
    expect(CLIPS.cargando.bucle).toBe(true);
  });
});

describe('404: Morfi sale por un hoyo de la tarjeta', () => {
  const { escenario, recorte, hoyo, orillaY } = CLIPS['no-encontrada'].escena;

  it('la orilla de abajo del hoyo y la del clip son la misma línea', () => {
    const delHoyo = cajaEnElEscenario(escenario, hoyo.caja);
    const delClip = cajaEnElEscenario(escenario, recorte);
    const orillaDelHoyo = delHoyo.arriba + delHoyo.alto * hoyo.orillaEnLaCaja;
    const orillaDelClip = delClip.arriba + delClip.alto * ((orillaY - recorte.y) / recorte.alto);
    expect(orillaDelHoyo).toBeCloseTo(orillaDelClip, 2);
  });

  it('cabe en el escenario y no es un bucle', () => {
    const c = cajaEnElEscenario(escenario, recorte);
    expect(c.izquierda).toBeGreaterThanOrEqual(0);
    expect(c.izquierda + c.ancho).toBeLessThanOrEqual(1);
    expect(c.arriba + c.alto).toBeLessThanOrEqual(1);
    expect(CLIPS['no-encontrada'].bucle).toBe(false);
  });
});

describe('el modo espera en dos piezas', () => {
  it('dormido es un bucle y despertar se ve una vez, con el mismo recorte', () => {
    expect(CLIPS.dormido.bucle).toBe(true);
    expect(CLIPS.despertar.bucle).toBe(false);
    expect(CLIPS.dormido.escena.recorte).toEqual(CLIPS.despertar.escena.recorte);
  });
});

describe('formatoParaElNavegador · Safari no reproduce WebM con transparencia', () => {
  const casos: readonly (readonly [string, string, number, 'webm' | 'webp'])[] = [
    [
      'Chrome en Android',
      'Mozilla/5.0 (Linux; Android 14; SM-X200) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
      5,
      'webm',
    ],
    [
      'Chrome en Windows',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
      0,
      'webm',
    ],
    [
      'Edge',
      'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0',
      0,
      'webm',
    ],
    ['Firefox', 'Mozilla/5.0 (Windows NT 10.0; rv:131.0) Gecko/20100101 Firefox/131.0', 0, 'webm'],
    [
      'Safari en la Mac',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15',
      0,
      'webp',
    ],
    [
      'Safari en el iPhone',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1',
      5,
      'webp',
    ],
    [
      'Chrome en el iPhone (también es WebKit)',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1',
      5,
      'webp',
    ],
    [
      'iPad que se presenta como Mac',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15',
      5,
      'webp',
    ],
    // El comensal que abre el QR desde WhatsApp o Instagram: el navegador de la app NO dice
    // «Safari/», y en el iPhone también es WebKit.
    [
      'navegador dentro de una app en el iPhone',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0',
      5,
      'webp',
    ],
    [
      'navegador dentro de una app en el iPad que se presenta como Mac',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)',
      5,
      'webp',
    ],
  ];
  for (const [nombre, ua, toques, esperado] of casos) {
    it(`${nombre} → ${esperado}`, () => {
      expect(formatoParaElNavegador(ua, toques)).toBe(esperado);
    });
  }
});

describe('rutasDe', () => {
  it('cada clip tiene su WebM, su WebP y su imagen fija servidos por el sitio', () => {
    expect(rutasDe('cargando')).toEqual({
      webm: '/morfi/cargando.webm',
      webp: '/morfi/cargando.webp',
      fijo: '/morfi/cargando-fijo.webp',
    });
  });
});
