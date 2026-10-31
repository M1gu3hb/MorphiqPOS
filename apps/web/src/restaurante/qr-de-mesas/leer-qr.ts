import jsQR from 'jsqr';

/**
 * Lee un QR de unos píxeles RGBA con jsQR (DP-9.8): lo que dice, o `null` si no se lee.
 *
 * Sin intentar invertido a propósito: un QR claro sobre fondo oscuro lo lee jsQR pero no muchas
 * cámaras de teléfono, y lo que se comprueba aquí es si se va a leer en la mesa.
 */
export function leerPixeles(datos: Uint8ClampedArray, ancho: number, alto: number): string | null {
  return jsQR(datos, ancho, alto, { inversionAttempts: 'dontInvert' })?.data ?? null;
}
