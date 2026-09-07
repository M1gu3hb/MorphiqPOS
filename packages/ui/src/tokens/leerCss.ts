import { readFileSync } from 'node:fs';

/**
 * Lector minimo de propiedades personalizadas de CSS.
 *
 * Existe para que las pruebas puedan afirmar cosas sobre las hojas de estilo sin
 * levantar un navegador. No es un analizador de CSS completo y no pretende
 * serlo: solo saca los pares `--nombre: valor;` de cada bloque.
 *
 * Si algun dia las hojas usan construcciones que esto no entiende, la prueba de
 * completitud lo dira en cuanto falte un token — que es exactamente el aviso que
 * hace falta.
 */

/** Un bloque de CSS: su selector y los tokens que declara. */
export interface BloqueCss {
  readonly selector: string;
  readonly tokens: ReadonlyMap<string, string>;
}

/** Quita comentarios para que un token comentado no cuente como declarado. */
function sinComentarios(css: string): string {
  return css.replaceAll(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * Extrae los bloques de declaraciones.
 *
 * Un bloque dentro de una regla `@` conserva el contexto en su selector:
 * `@media (prefers-reduced-motion: reduce) :root`. Sin eso, el bloque de
 * movimiento reducido se confundiria con el `:root` normal y una prueba creeria
 * que las duraciones siempre son cero.
 */
export function leerBloques(css: string): BloqueCss[] {
  const texto = sinComentarios(css);
  const bloques: BloqueCss[] = [];

  let inicioSelector = 0;
  const pila: { selector: string; inicioCuerpo: number }[] = [];

  for (let i = 0; i < texto.length; i += 1) {
    const caracter = texto[i];

    if (caracter === '{') {
      const selector = texto.slice(inicioSelector, i).trim();
      pila.push({ selector, inicioCuerpo: i + 1 });
      inicioSelector = i + 1;
      continue;
    }

    if (caracter === '}') {
      const abierto = pila.pop();
      if (!abierto) continue;

      // Los envoltorios @ no declaran tokens ellos mismos; aportan contexto.
      if (!abierto.selector.startsWith('@')) {
        const contexto = pila.map((nivel) => nivel.selector).join(' ');
        const cuerpo = texto.slice(abierto.inicioCuerpo, i);
        bloques.push({
          selector: `${contexto} ${abierto.selector}`.trim(),
          tokens: leerDeclaraciones(cuerpo),
        });
      }
      inicioSelector = i + 1;
    }
  }

  return bloques;
}

/** Saca los `--nombre: valor` de un cuerpo de bloque, ignorando anidados. */
function leerDeclaraciones(cuerpo: string): Map<string, string> {
  const tokens = new Map<string, string>();
  let profundidad = 0;
  let declaracion = '';

  for (const caracter of cuerpo) {
    if (caracter === '{') {
      profundidad += 1;
      continue;
    }
    if (caracter === '}') {
      profundidad -= 1;
      declaracion = '';
      continue;
    }
    if (profundidad > 0) continue;

    if (caracter === ';') {
      registrar(declaracion, tokens);
      declaracion = '';
      continue;
    }
    declaracion += caracter;
  }
  registrar(declaracion, tokens);

  return tokens;
}

function registrar(declaracion: string, tokens: Map<string, string>): void {
  const limpia = declaracion.trim();
  if (!limpia.startsWith('--')) return;

  const separador = limpia.indexOf(':');
  if (separador === -1) return;

  const nombre = limpia.slice(2, separador).trim();
  const valor = limpia.slice(separador + 1).trim();
  if (nombre.length > 0 && valor.length > 0) tokens.set(nombre, valor);
}

/**
 * Resuelve los tokens que ve un elemento con un conjunto de selectores activos.
 *
 * Los bloques se aplican en orden de aparicion, que es como se comporta CSS con
 * especificidad igual: el ultimo que coincide gana. Las hojas del sistema estan
 * escritas para depender de ese orden y no de trucos de especificidad.
 */
export function resolverTokens(bloques: readonly BloqueCss[], activos: readonly string[]): Map<string, string> {
  const resueltos = new Map<string, string>();

  for (const bloque of bloques) {
    if (!activos.includes(bloque.selector)) continue;
    for (const [nombre, valor] of bloque.tokens) resueltos.set(nombre, valor);
  }

  return resueltos;
}

export function leerArchivo(ruta: string): BloqueCss[] {
  return leerBloques(readFileSync(ruta, 'utf8'));
}
