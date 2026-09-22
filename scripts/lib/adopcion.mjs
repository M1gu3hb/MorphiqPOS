/**
 * EL ANALIZADOR DE `verify:adopcion` · qué le falta a una pantalla para usar el sistema.
 *
 * Lee el árbol de sintaxis de TypeScript, no el texto: una expresión regular sobre el
 * archivo no distingue un `<table>` de la palabra «table» en un comentario, ni un
 * `dineroEnTexto()` puesto en un `aria-label` de uno pintado entre dos `<span>`.
 *
 * Las cuatro condiciones, y lo que cuenta como incumplirlas:
 *
 *   1.1 SUPERFICIE  · un elemento con radio + fondo + (borde o sombra) escrito a mano,
 *                     o la `Card` de primitivas. La superficie del sistema es `Superficie`.
 *   1.2 TABLA       · `<table>`/`<tr>`/`<td>`…, los `Table*` de primitivas, un `role` de
 *                     tabla, o FILAS DE DATOS A MANO: un `.map()` que pinta filas con
 *                     `Dinero` o `Cifra` dentro. Eso es `Tabla` o `ListaDeTarjetas`.
 *   1.3 DINERO      · `Intl.NumberFormat` con moneda, `/ 100` formateado, un `$` pegado a
 *                     una expresión, un formateador propio (`enPesos`, `PESOS`…), o
 *                     `dineroEnTexto()` pintado como contenido. Todo importe es `<Dinero>`.
 *   1.4 ESTADOS     · pinta `Vacio`, un esqueleto y un error del sistema; y ninguno a
 *                     mano: `Skeleton` de primitivas, `role="alert"`, `animate-spin`,
 *                     un icono `Loader`, o el texto «Cargando».
 *
 * Una función pura: recibe el texto y devuelve hallazgos. Así se prueba con archivos
 * inventados, que es la única forma de ver la puerta en ROJO y en VERDE a voluntad.
 */
import ts from 'typescript';

import {
  SISTEMA,
  TAGS_DE_TABLA,
  ROLES_DE_TABLA,
  FILAS_POSIBLES,
  TESELAS,
  CONTROLES,
  CARGADORES,
  FORMATEADOR,
  clasesDe,
  esSuperficie,
  nombreDeEtiqueta,
  atributo,
  valorLiteral,
  aperturasEn,
  raizDelMapa,
  hijosElemento,
  aperturaDe,
  esContenido,
} from './adopcion-jsx.mjs';

/**
 * Analiza una pantalla. Devuelve `{ interfaz, hallazgos, pinta }`:
 * `hallazgos` es una lista de `{ condicion, motivo, linea }` y `pinta` dice qué
 * estados del sistema usa, para que el llamador aplique sus excepciones declaradas.
 */
export function analizarPantalla(texto, nombre = 'pantalla.tsx') {
  const fuente = ts.createSourceFile(
    nombre,
    texto,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const hallazgos = [];
  const linea = (nodo) => fuente.getLineAndCharacterOfPosition(nodo.getStart(fuente)).line + 1;
  const anotar = (condicion, motivo, nodo) =>
    hallazgos.push({ condicion, motivo, linea: linea(nodo) });

  // Los nombres locales que vienen del sistema, y los que vienen de otro sitio.
  const delSistema = new Set();
  const importados = new Map();
  for (const s of fuente.statements) {
    if (!ts.isImportDeclaration(s) || s.importClause === undefined) continue;
    const modulo = s.moduleSpecifier.text;
    const nombres = s.importClause.namedBindings;
    if (nombres === undefined || !ts.isNamedImports(nombres)) continue;
    for (const e of nombres.elements) {
      const local = e.name.text;
      importados.set(local, modulo);
      if (modulo === SISTEMA) delSistema.add(local);
      if (modulo.endsWith('primitivas/table')) anotar('1.2', `importa ${local} de primitivas`, e);
      if (modulo.endsWith('primitivas/card')) anotar('1.1', `importa ${local} de primitivas`, e);
      if (modulo.endsWith('primitivas/skeleton'))
        anotar('1.4', 'esqueleto a mano (Skeleton de primitivas)', e);
      if (modulo === 'lucide-react' && CARGADORES.has(e.propertyName?.text ?? local))
        anotar('1.4', `carga a mano (icono ${local})`, e);
      if (FORMATEADOR.test(e.propertyName?.text ?? local))
        anotar('1.3', `importa el formateador ${local}`, e);
    }
  }

  const aperturas = aperturasEn(fuente);
  const minusculas = aperturas.filter((a) => /^[a-z]/.test(nombreDeEtiqueta(a)));
  const componentes = aperturas.map(nombreDeEtiqueta).filter((n) => !/^[a-z]/.test(n));
  const interfaz =
    minusculas.length > 0 ||
    componentes.some((n) => !/(Provider|Toaster)$|^Proveedor|^Contexto\./.test(n));

  // ── Los elementos, uno por uno ─────────────────────────────────────────
  for (const a of minusculas) {
    const tag = nombreDeEtiqueta(a);
    const clase = atributo(a, 'className');
    const clases = clase?.initializer === undefined ? [] : clasesDe(clase.initializer);
    if (!CONTROLES.has(tag) && esSuperficie(clases))
      anotar('1.1', `superficie a mano en <${tag}>`, a);
    if (TAGS_DE_TABLA.has(tag)) anotar('1.2', `<${tag}> a mano`, a);
    const rol = valorLiteral(atributo(a, 'role'));
    if (rol !== undefined && ROLES_DE_TABLA.has(rol)) anotar('1.2', `role="${rol}" a mano`, a);
    if (rol === 'alert') anotar('1.4', `error a mano (<${tag} role="alert">)`, a);
    if (clases.includes('animate-spin') || clases.includes('animate-pulse'))
      anotar(
        '1.4',
        `carga a mano (${clases.includes('animate-spin') ? 'animate-spin' : 'animate-pulse'})`,
        a,
      );
  }

  // Los estados que pinta, SOLO si el nombre viene del sistema.
  const pinta = { vacio: false, cargando: false, error: false };
  for (const n of componentes) {
    if (!delSistema.has(n)) continue;
    if (n === 'Vacio') pinta.vacio = true;
    if (n === 'Esqueleto' || n === 'EsqueletoDeLista') pinta.cargando = true;
    if (n === 'ErrorDePantalla' || n === 'Aviso') pinta.error = true;
  }

  // Los identificadores que llevan dinero ya hecho texto, para seguirlos hasta el JSX.
  const contaminados = new Set();
  const visitar = (nodo) => {
    // 1.3 · Intl.NumberFormat / toLocaleString con moneda
    if (ts.isObjectLiteralExpression(nodo)) {
      const estilo = nodo.properties.find(
        (p) => ts.isPropertyAssignment(p) && p.name.getText() === 'style',
      );
      if (
        estilo !== undefined &&
        ts.isStringLiteral(estilo.initializer) &&
        estilo.initializer.text === 'currency'
      ) {
        anotar('1.3', 'formato de moneda a mano (style: currency)', nodo);
      }
    }
    // 1.3 · `(x / 100).toFixed(…)` o `.toLocaleString(…)`
    if (ts.isCallExpression(nodo) && ts.isPropertyAccessExpression(nodo.expression)) {
      const metodo = nodo.expression.name.text;
      if (
        (metodo === 'toFixed' || metodo === 'toLocaleString') &&
        /\/\s*100\b/.test(nodo.expression.expression.getText(fuente))
      ) {
        anotar('1.3', `centavos a pesos a mano (/ 100).${metodo}`, nodo);
      }
      if (metodo === 'format' && FORMATEADOR.test(nodo.expression.expression.getText(fuente))) {
        anotar(
          '1.3',
          `formateador propio ${nodo.expression.expression.getText(fuente)}.format`,
          nodo,
        );
      }
    }
    // 1.3 · llamadas y definiciones de un formateador propio
    if (
      ts.isCallExpression(nodo) &&
      ts.isIdentifier(nodo.expression) &&
      FORMATEADOR.test(nodo.expression.text) &&
      !delSistema.has(nodo.expression.text)
    ) {
      anotar('1.3', `formateador propio ${nodo.expression.text}()`, nodo);
    }
    if (
      (ts.isFunctionDeclaration(nodo) || ts.isVariableDeclaration(nodo)) &&
      nodo.name !== undefined &&
      ts.isIdentifier(nodo.name) &&
      FORMATEADOR.test(nodo.name.text)
    ) {
      anotar('1.3', `define el formateador ${nodo.name.text}`, nodo);
    }
    // 1.3 · un `$` pegado a una expresión: `$${x}`, '$' + x, o `$` en el JSX antes de `{x}`
    if (ts.isTemplateExpression(nodo)) {
      const trozos = [nodo.head, ...nodo.templateSpans.slice(0, -1).map((s) => s.literal)];
      if (trozos.some((t) => t.text.endsWith('$')))
        anotar('1.3', 'importe con `$` a mano en una plantilla', nodo);
    }
    if (
      ts.isBinaryExpression(nodo) &&
      nodo.operatorToken.kind === ts.SyntaxKind.PlusToken &&
      [nodo.left, nodo.right].some((l) => ts.isStringLiteral(l) && /\$\s*$/.test(l.text))
    ) {
      anotar('1.3', "importe con '$' + … a mano", nodo);
    }
    if (ts.isJsxText(nodo) && /\$\s*$/.test(nodo.text)) {
      const siguiente = nodo.parent.children?.[nodo.parent.children.indexOf(nodo) + 1];
      if (siguiente !== undefined && ts.isJsxExpression(siguiente))
        anotar('1.3', 'importe con `$` a mano en el JSX', nodo);
    }
    // 1.4 · «Cargando» como texto
    if (ts.isJsxText(nodo) && /\bcargando\b/i.test(nodo.text))
      anotar('1.4', 'carga a mano (texto «Cargando»)', nodo);
    // 1.3 · dineroEnTexto: sólo fuera del contenido
    if (
      ts.isVariableDeclaration(nodo) &&
      nodo.initializer !== undefined &&
      /\bdineroEnTexto\s*\(/.test(nodo.initializer.getText(fuente)) &&
      ts.isIdentifier(nodo.name)
    ) {
      contaminados.add(nodo.name.text);
    }
    ts.forEachChild(nodo, visitar);
  };
  visitar(fuente);

  const pintados = [];
  const buscarPintado = (nodo) => {
    if (
      ts.isCallExpression(nodo) &&
      ts.isIdentifier(nodo.expression) &&
      nodo.expression.text === 'dineroEnTexto' &&
      esContenido(nodo)
    )
      pintados.push(nodo);
    if (
      ts.isIdentifier(nodo) &&
      contaminados.has(nodo.text) &&
      !ts.isVariableDeclaration(nodo.parent) &&
      esContenido(nodo)
    )
      pintados.push(nodo);
    ts.forEachChild(nodo, buscarPintado);
  };
  buscarPintado(fuente);
  for (const p of pintados) anotar('1.3', 'dineroEnTexto() pintado como contenido: es <Dinero>', p);

  // ── 1.2 · filas de datos a mano ──────────────────────────────────────────
  const buscarMapas = (nodo) => {
    if (
      ts.isCallExpression(nodo) &&
      ts.isPropertyAccessExpression(nodo.expression) &&
      nodo.expression.name.text === 'map'
    ) {
      const funcion = nodo.arguments[0];
      const raiz =
        funcion !== undefined && (ts.isArrowFunction(funcion) || ts.isFunctionExpression(funcion))
          ? raizDelMapa(funcion)
          : undefined;
      if (raiz !== undefined) {
        const tag = nombreDeEtiqueta(aperturaDe(raiz));
        const hijos = hijosElemento(raiz);
        const esTesela = hijos.length === 1 && TESELAS.has(nombreDeEtiqueta(aperturaDe(hijos[0])));
        const conCifras = aperturasEn(raiz).some((a) =>
          ['Dinero', 'Cifra'].includes(nombreDeEtiqueta(a)),
        );
        if (FILAS_POSIBLES.has(tag) && !esTesela && conCifras)
          anotar('1.2', `filas de datos a mano (<${tag}> con cifras en un .map)`, raiz);
      }
    }
    ts.forEachChild(nodo, buscarMapas);
  };
  buscarMapas(fuente);

  return { interfaz, hallazgos, pinta };
}
