/**
 * LO QUE `verify:adopcion` LEE DEL ÁRBOL · clases, etiquetas, atributos y mapas.
 *
 * Separado del analizador para que cada archivo diga una cosa: aquí está CÓMO se lee
 * un JSX —qué es una clase, qué es contenido, qué devuelve un `.map()`—; en
 * `adopcion.mjs`, QUÉ cuenta como incumplir cada condición.
 */
import ts from 'typescript';

export const SISTEMA = '@morphiqpos/ui/sistema';
export const TAGS_DE_TABLA = new Set([
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'td',
  'th',
  'caption',
]);
export const ROLES_DE_TABLA = new Set([
  'table',
  'grid',
  'row',
  'rowgroup',
  'cell',
  'gridcell',
  'columnheader',
  'rowheader',
]);
export const FILAS_POSIBLES = new Set(['li', 'div', 'article', 'section', 'tr', 'dl']);
export const TESELAS = new Set(['button', 'a', 'label', 'Link']);
/** Los controles nativos no son superficies: su pieza es `Input`, `Select`, `Textarea`. */
export const CONTROLES = new Set(['input', 'select', 'textarea']);
export const CARGADORES = new Set(['Loader', 'Loader2', 'LoaderCircle', 'LoaderPinwheel']);
export const FORMATEADOR =
  /^(en_?pesos|pesos(_exactos)?|formatear(dinero|pesos|moneda|importe)|a_?pesos|moneda)$/i;
export const FONDO_NO_COLOR =
  /^bg-(transparent|none|clip-|origin-|fixed|local|scroll|repeat|no-repeat|cover|contain|auto|center|top|bottom|left|right|blend-|linear|radial|conic|gradient)/;
export const BORDE_NO_BORDE = /^border-(0|none|collapse|separate|spacing|transparent)\b/;

/** `md:hover:bg-card/50` → `bg-card/50`. */
export function utilidad(clase) {
  return clase.split(':').pop().replace(/^!/, '');
}

/** Todas las clases que puede llevar un `className`, sea literal, `cn(...)` o ternario. */
export function clasesDe(expresion) {
  const textos = [];
  const visitar = (nodo) => {
    if (ts.isStringLiteral(nodo) || ts.isNoSubstitutionTemplateLiteral(nodo))
      textos.push(nodo.text);
    else if (ts.isTemplateExpression(nodo)) {
      textos.push(nodo.head.text, ...nodo.templateSpans.map((s) => s.literal.text));
      nodo.templateSpans.forEach((s) => visitar(s.expression));
    } else ts.forEachChild(nodo, visitar);
  };
  visitar(expresion);
  return textos.join(' ').split(/\s+/).filter(Boolean).map(utilidad);
}

export function esSuperficie(clases) {
  const radio = clases.some((c) => /^rounded(-|$)/.test(c) && c !== 'rounded-none');
  const fondo = clases.some((c) => c.startsWith('bg-') && !FONDO_NO_COLOR.test(c));
  const borde = clases.some((c) => /^border(-|$)/.test(c) && !BORDE_NO_BORDE.test(c));
  const sombra = clases.some((c) => /^shadow(-|$)/.test(c) && c !== 'shadow-none');
  return radio && fondo && (borde || sombra);
}

export function nombreDeEtiqueta(apertura) {
  return apertura.tagName.getText();
}

export function atributo(apertura, nombre) {
  return apertura.attributes.properties.find(
    (p) => ts.isJsxAttribute(p) && p.name.getText() === nombre,
  );
}

export function valorLiteral(attr) {
  if (attr?.initializer === undefined) return undefined;
  if (ts.isStringLiteral(attr.initializer)) return attr.initializer.text;
  const exp = ts.isJsxExpression(attr.initializer) ? attr.initializer.expression : undefined;
  return exp !== undefined && ts.isStringLiteral(exp) ? exp.text : undefined;
}

/** Los elementos JSX de un subárbol, con su apertura (sea `<a>` o `<a/>`). */
export function aperturasEn(nodo) {
  const salida = [];
  const visitar = (n) => {
    if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) salida.push(n);
    ts.forEachChild(n, visitar);
  };
  visitar(nodo);
  return salida;
}

/** El elemento raíz que devuelve la función de un `.map()`, si devuelve JSX. */
export function raizDelMapa(funcion) {
  let cuerpo = funcion.body;
  if (cuerpo !== undefined && ts.isBlock(cuerpo)) {
    const ret = cuerpo.statements.findLast((s) => ts.isReturnStatement(s));
    cuerpo = ret?.expression;
  }
  while (cuerpo !== undefined && ts.isParenthesizedExpression(cuerpo)) cuerpo = cuerpo.expression;
  if (cuerpo === undefined) return undefined;
  if (ts.isJsxElement(cuerpo)) return cuerpo;
  if (ts.isJsxSelfClosingElement(cuerpo)) return cuerpo;
  return undefined;
}

export function hijosElemento(elemento) {
  if (!ts.isJsxElement(elemento)) return [];
  return elemento.children.filter((h) => ts.isJsxElement(h) || ts.isJsxSelfClosingElement(h));
}

export function aperturaDe(elemento) {
  return ts.isJsxElement(elemento) ? elemento.openingElement : elemento;
}

/** ¿Está este nodo pintado como CONTENIDO —hijo de un elemento— y no en un atributo? */
export function esContenido(nodo) {
  for (let n = nodo.parent; n !== undefined; n = n.parent) {
    if (ts.isJsxAttribute(n)) return false;
    if (
      ts.isJsxExpression(n) &&
      n.parent !== undefined &&
      (ts.isJsxElement(n.parent) || ts.isJsxFragment(n.parent))
    )
      return true;
    if (ts.isCallExpression(n) && !ts.isJsxExpression(n.parent)) return false;
  }
  return false;
}
