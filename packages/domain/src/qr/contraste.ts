/**
 * ¿SE VA A PODER LEER?
 *
 * Un QR bonito que no escanea es peor que uno feo. La regla es la de accesibilidad web (WCAG):
 * una relación de contraste de al menos 4.5 a 1, y con la tinta MÁS OSCURA que el fondo —los
 * lectores esperan módulos oscuros sobre fondo claro; un QR invertido lo leen pocos—.
 */

/** Un color como lo guarda el diseño: `#rgb` o `#rrggbb`. Nada de nombres ni de `url(...)`. */
const COLOR_HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Relación mínima de contraste entre tinta y fondo (WCAG AA para texto normal). */
export const CONTRASTE_MINIMO = 4.5;

export function esColorHex(valor: string): boolean {
  return COLOR_HEX.test(valor);
}

/**
 * Los colores acaban escritos dentro de atributos del SVG (`fill="..."`): uno con una comilla
 * dentro cierra el atributo y deja escribir otros. Se exige un hexadecimal en la frontera.
 */
export function exigirColor(valor: string, nombre: string): string {
  if (!esColorHex(valor)) {
    throw new RangeError(
      `${nombre} debe ser un color hexadecimal (#rgb o #rrggbb); llegó «${valor}».`,
    );
  }
  return valor;
}

/** Cada canal 0-255 de un color hexadecimal; `#abc` equivale a `#aabbcc`. */
function canales(color: string): readonly [number, number, number] {
  if (!esColorHex(color)) {
    throw new RangeError(`«${color}» no es un color hexadecimal (#rgb o #rrggbb).`);
  }
  const cuerpo = color.slice(1);
  const completo =
    cuerpo.length === 3 ? Array.from(cuerpo, (digito) => digito + digito).join('') : cuerpo;
  return [
    parseInt(completo.slice(0, 2), 16),
    parseInt(completo.slice(2, 4), 16),
    parseInt(completo.slice(4, 6), 16),
  ];
}

function linealizar(canal: number): number {
  const c = canal / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Luminancia relativa (0 negro, 1 blanco) según WCAG. */
export function luminancia(color: string): number {
  const [rojo, verde, azul] = canales(color);
  return 0.2126 * linealizar(rojo) + 0.7152 * linealizar(verde) + 0.0722 * linealizar(azul);
}

/**
 * La tinta de los módulos y la de los ojos deben leerse sobre el fondo. Devuelve `false` si
 * alguna es más clara que el fondo (invertido) o si el contraste queda por debajo de
 * {@link CONTRASTE_MINIMO}.
 */
export function tieneColoresLegibles(primerPlano: string, ojos: string, fondo: string): boolean {
  const luzDelFondo = luminancia(fondo);
  return [primerPlano, ojos].every((tinta) => {
    const luzDeLaTinta = luminancia(tinta);
    return (
      luzDelFondo > luzDeLaTinta && (luzDelFondo + 0.05) / (luzDeLaTinta + 0.05) >= CONTRASTE_MINIMO
    );
  });
}
