/**
 * Matematica de color para auditar contraste.
 *
 * `05-SISTEMA-DE-DISENO §9` — "Accesibilidad como puerta, no como intencion.
 * Se verifica en CI, no en la revision final."
 *
 * La justificacion no es normativa: un POS lo usa un empleado diez horas al dia,
 * a veces con poca luz y de reojo mientras cobra. Aqui el contraste es velocidad
 * y menos errores de cobro.
 *
 * Todo es funcion pura sobre numeros: se prueba sin navegador.
 */

/** Color en el formato que usan los tokens: matiz, saturacion y luminosidad. */
export interface ColorHsl {
  readonly matiz: number;
  readonly saturacion: number;
  readonly luminosidad: number;
}

/** Componentes sRGB en el rango 0..1. */
export interface ColorRgb {
  readonly rojo: number;
  readonly verde: number;
  readonly azul: number;
}

/**
 * Lee el valor de un token de color.
 *
 * Los tokens se guardan como `210 40% 98%` —sin la funcion `hsl()`— que es la
 * convencion de shadcn que ambos sistemas fuente ya usan. Permite componer
 * `hsl(var(--fondo) / 0.5)` sin duplicar tokens por opacidad.
 */
export function leerHsl(valor: string): ColorHsl | null {
  const partes = valor.trim().split(/[\s,]+/);
  if (partes.length < 3) return null;

  const matiz = Number.parseFloat(partes[0] ?? '');
  const saturacion = Number.parseFloat((partes[1] ?? '').replace('%', ''));
  const luminosidad = Number.parseFloat((partes[2] ?? '').replace('%', ''));

  if (!Number.isFinite(matiz) || !Number.isFinite(saturacion) || !Number.isFinite(luminosidad)) {
    return null;
  }

  return { matiz, saturacion, luminosidad };
}

/** Convierte HSL a sRGB. Algoritmo estandar de la especificacion de CSS Color. */
export function hslARgb({ matiz, saturacion, luminosidad }: ColorHsl): ColorRgb {
  const s = saturacion / 100;
  const l = luminosidad / 100;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((matiz % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));

  // Tupla explicita: con noUncheckedIndexedAccess, desestructurar un
  // number[] daria number | undefined y obligaria a comprobaciones falsas.
  const canales: readonly [number, number, number] =
    hp < 1
      ? [c, x, 0]
      : hp < 2
        ? [x, c, 0]
        : hp < 3
          ? [0, c, x]
          : hp < 4
            ? [0, x, c]
            : hp < 5
              ? [x, 0, c]
              : [c, 0, x];

  const m = l - c / 2;
  return { rojo: canales[0] + m, verde: canales[1] + m, azul: canales[2] + m };
}

/** Linealiza un canal sRGB. WCAG 2.2, definicion de luminancia relativa. */
function linealizar(canal: number): number {
  return canal <= 0.040_45 ? canal / 12.92 : ((canal + 0.055) / 1.055) ** 2.4;
}

/** Luminancia relativa, 0 (negro) a 1 (blanco). */
export function luminancia(color: ColorRgb): number {
  return (
    0.2126 * linealizar(color.rojo) +
    0.7152 * linealizar(color.verde) +
    0.0722 * linealizar(color.azul)
  );
}

/**
 * Razon de contraste entre dos colores, de 1:1 a 21:1.
 *
 * Umbrales de WCAG 2.2 nivel AA:
 *   4.5  texto normal
 *   3.0  texto grande (>= 24 px, o >= 19 px en negrita) y elementos de interfaz
 */
export function contraste(primero: ColorHsl, segundo: ColorHsl): number {
  const a = luminancia(hslARgb(primero));
  const b = luminancia(hslARgb(segundo));
  const claro = Math.max(a, b);
  const oscuro = Math.min(a, b);
  return (claro + 0.05) / (oscuro + 0.05);
}

/** Redondea a un decimal, que es como se lee un informe de contraste. */
export function contrasteLegible(primero: ColorHsl, segundo: ColorHsl): number {
  return Math.round(contraste(primero, segundo) * 10) / 10;
}

/** Un color en OKLab: claridad y dos ejes de color. */
export interface ColorOklab {
  readonly claridad: number;
  readonly ejeA: number;
  readonly ejeB: number;
}

/**
 * Convierte sRGB a OKLab.
 *
 * Hace falta un espacio perceptual porque la razon de contraste de WCAG mide
 * LUMINANCIA, y eso no sirve para decidir si dos series de una grafica se
 * distinguen: dos tonos distintos con la misma luminosidad dan 1.1:1 y aun asi
 * se ven perfectamente diferentes. Usar contraste ahi obligaria a escalonar los
 * seis colores por claridad, que es justo lo que hace fea una paleta categorica.
 *
 * OKLab si mide distancia percibida, que es la pregunta real.
 */
export function rgbAOklab({ rojo, verde, azul }: ColorRgb): ColorOklab {
  const r = linealizar(rojo);
  const g = linealizar(verde);
  const b = linealizar(azul);

  const l = Math.cbrt(0.412_221_470_8 * r + 0.536_332_536_3 * g + 0.051_445_992_9 * b);
  const m = Math.cbrt(0.211_903_498_2 * r + 0.680_699_545_1 * g + 0.107_396_956_6 * b);
  const s = Math.cbrt(0.088_302_461_9 * r + 0.281_718_837_6 * g + 0.629_978_700_5 * b);

  return {
    claridad: 0.210_454_255_3 * l + 0.793_617_785 * m - 0.004_072_046_8 * s,
    ejeA: 1.977_998_495_1 * l - 2.428_592_205 * m + 0.450_593_709_9 * s,
    ejeB: 0.025_904_037_1 * l + 0.782_771_766_2 * m - 0.808_675_766 * s,
  };
}

/**
 * Distancia percibida entre dos colores en OKLab.
 *
 * Referencia practica: por debajo de ~0.10 dos colores se confunden en una
 * pantalla barata con poca luz, que es exactamente la pantalla donde va a correr
 * esto. Por encima de ~0.15 se distinguen sin esfuerzo.
 */
export function distanciaPerceptual(primero: ColorHsl, segundo: ColorHsl): number {
  const a = rgbAOklab(hslARgb(primero));
  const b = rgbAOklab(hslARgb(segundo));

  return Math.hypot(a.claridad - b.claridad, a.ejeA - b.ejeA, a.ejeB - b.ejeB);
}
