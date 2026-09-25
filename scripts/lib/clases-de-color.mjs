/**
 * Qué es una CLASE DE COLOR, dicho una sola vez (C.16 de la etapa 2.4).
 *
 * Lo usan dos puertas:
 *   · `verificar-traduccion-de-color.mjs` demuestra que un commit del heredado sólo
 *     cambió colores: quita de las dos versiones toda clase de color y todo espacio,
 *     y exige que lo que queda sea IDÉNTICO. Cualquier otra cosa —una clase de
 *     espaciado, un texto, un icono, un orden— sobrevive a la limpieza y la delata.
 *   · `verificar-primitivas.mjs` prohíbe en `heredado/` los colores de PALETA
 *     (`bg-white`, `text-emerald-700`…), para que no vuelvan después de traducirse.
 *
 * Una clase de color es: prefijos de variante opcionales (`dark:`, `hover:`,
 * `md:`, `data-[state=open]:`…), una propiedad que pinta (`bg`, `text`, `border`,
 * `ring`, `from`…), y un color —de paleta de Tailwind o un token del sistema—, con
 * opacidad opcional (`/70`).
 */

const PROPIEDADES =
  '(?:bg|text|border(?:-[trblxyse])?|ring|ring-offset|from|to|via|fill|stroke|divide|outline|placeholder|accent|shadow|caret|decoration)';

const PALETA =
  '(?:white|black|(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\\d{2,3})';

const TOKENS =
  '(?:transparent|current|fondo(?:-sutil)?|superficie(?:-elevada)?|texto(?:-sutil|-tenue)?|borde(?:-fuerte)?|anillo|primario(?:-texto)?|acento(?:-texto|-suave(?:-texto)?)?|exito(?:-texto)?|advertencia(?:-texto)?|peligro(?:-texto)?|info(?:-texto)?|grafico-[1-6]|velo|lateral-(?:fondo|texto|activo(?:-texto)?|hover|borde))';

const VARIANTES = '(?:(?:[a-z0-9-]+|[a-z-]*\\[[^\\]\\s]*\\]):)*';

const OPACIDAD = '(?:\\/\\d{1,3})?';

/** Una clase de color cualquiera, de paleta o de token. `g` para recorrer un texto. */
export const CLASE_DE_COLOR = new RegExp(
  `(?<![\\w\\-:/\\[])${VARIANTES}${PROPIEDADES}-(?:${PALETA}|${TOKENS})${OPACIDAD}(?![\\w\\-/])`,
  'g',
);

/** Sólo las de PALETA: las que no pueden volver al heredado. */
export const CLASE_DE_PALETA = new RegExp(
  `(?<![\\w\\-:/\\[])${VARIANTES}${PROPIEDADES}-${PALETA}${OPACIDAD}(?![\\w\\-/])`,
  'g',
);

/**
 * El texto sin clases de color y sin espacio. Dos versiones de un archivo que sólo
 * difieren en colores dan exactamente la misma cadena.
 */
export function sinColores(texto) {
  return texto.replace(CLASE_DE_COLOR, '').replace(/\s+/g, '');
}

/** Las clases de paleta que quedan en un texto, en orden de aparición. */
export function clasesDePaleta(texto) {
  return [...texto.matchAll(CLASE_DE_PALETA)].map((m) => m[0]);
}
