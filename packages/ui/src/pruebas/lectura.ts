/**
 * CÓMO SE LEE UN COMPONENTE PINTADO · para las pruebas de `packages/ui`.
 *
 * `<Dinero>` enseñó **$42.00** por un producto de $42.90 y su `textContent` estaba
 * bien: era `$42.90` antes y después del arreglo. Lo que se rompió fue el texto que
 * sale al LEER la pantalla —`innerText`, copiar y pegar, la prueba de navegador—,
 * porque los hijos de un contenedor flex o grid se vuelven BLOQUES y cada bloque
 * empieza en su propio renglón: `$`, `42` y `.90` separados.
 *
 * Una prueba que sólo mira `textContent` habría seguido verde con el defecto puesto.
 * Por eso aquí hay dos lecturas: el `textContent` de siempre, y una que imita la regla
 * de `innerText` que importa —los hijos de un flex o un grid van en renglones
 * distintos—. Sin navegador y sin DOM: el marcado que devuelve `react-dom/server`.
 */

interface Nodo {
  readonly etiqueta: string;
  readonly clases: readonly string[];
  readonly hijos: (Nodo | string)[];
}

/** Las utilidades que convierten a los HIJOS en bloques, que es lo que parte un valor. */
const APILA_A_SUS_HIJOS = /^(inline-)?(flex|grid)$/;

function decodificar(texto: string): string {
  return texto
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#x27;', "'")
    .replaceAll('&amp;', '&');
}

const VACIOS = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'source', 'wbr']);

/** Un árbol mínimo del marcado de React: bien formado siempre, así que basta esto. */
export function arbol(marcado: string): Nodo {
  const raiz: Nodo = { etiqueta: '#raiz', clases: [], hijos: [] };
  const pila: Nodo[] = [raiz];
  for (const trozo of marcado.matchAll(/<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>|([^<]+)/g)) {
    const [, cierre, etiqueta, atributos, autocierre, texto] = trozo;
    const actual = pila.at(-1);
    if (actual === undefined) break;
    if (texto !== undefined) {
      actual.hijos.push(decodificar(texto));
      continue;
    }
    if (cierre === '/') {
      pila.pop();
      continue;
    }
    const clase = /\sclass="([^"]*)"/.exec(atributos ?? '')?.[1] ?? '';
    const nodo: Nodo = {
      etiqueta: etiqueta ?? '',
      clases: clase.split(/\s+/).filter(Boolean),
      hijos: [],
    };
    actual.hijos.push(nodo);
    if (autocierre !== '/' && !VACIOS.has(nodo.etiqueta)) pila.push(nodo);
  }
  return raiz;
}

/** `textContent`: todo el texto, pegado. */
export function textoPlano(nodo: Nodo | string): string {
  return typeof nodo === 'string' ? nodo : nodo.hijos.map(textoPlano).join('');
}

/**
 * Lo que se LEE: como `textContent`, salvo que los hijos de un flex o un grid van en
 * renglones distintos. Es la parte de `innerText` que partió el importe.
 */
export function textoLeido(nodo: Nodo | string): string {
  if (typeof nodo === 'string') return nodo;
  const apila = nodo.clases.some((c) => APILA_A_SUS_HIJOS.test(c.split(':').pop() ?? ''));
  const partes = nodo.hijos.map(textoLeido).filter((p) => !apila || p.trim() !== '');
  return partes.join(apila ? '\n' : '');
}

/** Todas las clases de un subárbol, para afirmar que ninguna apila un valor. */
export function clasesDelArbol(nodo: Nodo | string): string[] {
  if (typeof nodo === 'string') return [];
  return [...nodo.clases, ...nodo.hijos.flatMap(clasesDelArbol)];
}
