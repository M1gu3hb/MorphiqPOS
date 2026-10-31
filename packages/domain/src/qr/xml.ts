/**
 * LO ÚNICO QUE ENTRA A UN SVG COMO TEXTO.
 *
 * El texto de un marco lo escribe una persona («Café & Tacos», «5" de ancho»). Sin escapar,
 * un `<` rompe el documento y un `"` dentro de un atributo deja escribir otros: es la
 * diferencia entre un rótulo y una inyección en la página que lo muestre.
 */

const ENTIDADES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

/** Escapa los cinco caracteres que XML trata como sintaxis. */
export function escaparXml(valor: string): string {
  return valor.replace(/[&<>"']/g, (caracter) => ENTIDADES[caracter] ?? caracter);
}

/**
 * Deja un texto listo para dibujarse: sin los caracteres de control que XML 1.0 prohíbe (un
 * solo `\u0001` basta para que el navegador rechace el SVG entero) y sin pasar de `maximo`
 * caracteres. Cuenta caracteres de verdad, no unidades UTF-16, para no partir un emoji por la
 * mitad.
 */
export function limpiarTexto(valor: string, maximo: number): string {
  const sinSaltosDeWindows = valor.replace(/\r\n?/g, '\n');
  const permitidos = Array.from(sinSaltosDeWindows).filter((caracter) => {
    const codigo = caracter.codePointAt(0) ?? 0;
    return codigo >= 32 || codigo === 9 || codigo === 10;
  });
  return permitidos.slice(0, maximo).join('');
}
