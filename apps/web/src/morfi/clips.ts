/**
 * MORFI EN EL POS (DP-11.1) · los clips aprobados por Miguel, dónde van y en qué formato.
 *
 * Fuente: `M1gu3hb/Morfi-pet`, carpeta `ux-pos/`, commit `c61aab2` (sólo se leyó). Los
 * recortes transparentes (`videos/solo-morfi-recorte/`) se copiaron a `public/morfi/` y de ahí
 * salieron su WebP animado y su imagen fija. Los números son los de `videos/escenas.json` y
 * `recortes.json`: el recorte de cada clip, la orilla detrás de la que se asoma y la tarjeta de
 * la escena, en el cuadro de 1920 × 1080. De ellos sale la geometría: nada se ajusta a ojo.
 *
 * Hoy entran tres de los diecisiete (los demás esperan a que se corrijan brazos y cuerpo):
 * «Cargando», la página que no existe y el modo espera, partido en dormido y despertar.
 */

export interface Caja {
  readonly x: number;
  readonly y: number;
  readonly ancho: number;
  readonly alto: number;
}

export const CLIPS = {
  cargando: {
    bucle: true,
    duracionMs: 4800,
    escena: {
      recorte: { x: 780, y: 230, ancho: 376, alto: 446 },
      orillaY: 616,
      tarjeta: { x: 680, y: 612, ancho: 560, alto: 156 },
    },
  },
  'no-encontrada': {
    bucle: false,
    duracionMs: 5050,
    escena: {
      recorte: { x: 786, y: 284, ancho: 368, alto: 464 },
      orillaY: 590,
      // La escena: la tarjeta empieza en (560, 180) y mide 800 de ancho; el título va en 760.
      // El escenario es lo de la tarjeta que queda arriba del título.
      escenario: { x: 560, y: 180, ancho: 800, alto: 580 },
      hoyo: { caja: { x: 700, y: 220, ancho: 560, alto: 440 }, orillaEnLaCaja: 370 / 440 },
    },
  },
  dormido: {
    bucle: true,
    // Cuadros 1 a 76 del clip 11: el 77 casi repite al 1 (2.7 contra 2.3 de un paso normal).
    duracionMs: Math.round((76 / 30) * 1000),
    escena: { recorte: { x: 788, y: 548, ancho: 524, alto: 532 }, orillaY: 1080 },
  },
  despertar: {
    bucle: false,
    duracionMs: Math.round((88 / 30) * 1000),
    escena: { recorte: { x: 788, y: 548, ancho: 524, alto: 532 }, orillaY: 1080 },
  },
} as const;

export type ClaveDeClip = keyof typeof CLIPS;

/**
 * Dónde se pinta un clip que se asoma DETRÁS de una tarjeta, en fracciones de la tarjeta: su
 * borde izquierdo y su ancho (del ancho de la tarjeta), cuánto de SU alto baja del borde de
 * arriba de la tarjeta (las manos sobre la cara) y cuánto de la tarjeta tapan las manos.
 */
export function sobreLaTarjeta(escena: { readonly recorte: Caja; readonly tarjeta: Caja }): {
  readonly izquierda: number;
  readonly ancho: number;
  readonly bajaDeLaOrilla: number;
  readonly solape: number;
} {
  const { recorte, tarjeta } = escena;
  const debajo = recorte.y + recorte.alto - tarjeta.y;
  return {
    izquierda: (recorte.x - tarjeta.x) / tarjeta.ancho,
    ancho: recorte.ancho / tarjeta.ancho,
    bajaDeLaOrilla: debajo / recorte.alto,
    solape: debajo / tarjeta.ancho,
  };
}

/** Una caja de la escena, en fracciones del escenario que la contiene. */
export function cajaEnElEscenario(
  escenario: Caja,
  caja: Caja,
): {
  readonly izquierda: number;
  readonly arriba: number;
  readonly ancho: number;
  readonly alto: number;
} {
  return {
    izquierda: (caja.x - escenario.x) / escenario.ancho,
    arriba: (caja.y - escenario.y) / escenario.alto,
    ancho: caja.ancho / escenario.ancho,
    alto: caja.alto / escenario.alto,
  };
}

/**
 * SAFARI NO REPRODUCE WEBM CON TRANSPARENCIA, y en el iPhone y el iPad todo navegador es
 * Safari por dentro (WebKit). Ahí va el WebP animado, a 15 cuadros —«en dos», la cadencia que la
 * propia investigación de Morfi acepta— para que pese la mitad. El iPad se presenta como Mac:
 * se le reconoce por la pantalla táctil.
 */
export function formatoParaElNavegador(ua: string, puntosDeToque: number): 'webm' | 'webp' {
  const ios = /iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && puntosDeToque > 1);
  if (ios) return 'webp';
  const safari = ua.includes('Safari/') && !/(Chrome|Chromium|Edg|OPR|Firefox|Android)\//.test(ua);
  return safari ? 'webp' : 'webm';
}

export function rutasDe(clave: ClaveDeClip): {
  readonly webm: string;
  readonly webp: string;
  readonly fijo: string;
} {
  return {
    webm: `/morfi/${clave}.webm`,
    webp: `/morfi/${clave}.webp`,
    fijo: `/morfi/${clave}-fijo.webp`,
  };
}
