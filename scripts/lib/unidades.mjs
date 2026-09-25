/**
 * EL ANALIZADOR DE `verify:unidades` (bloque C.2 de la 2.4).
 *
 * Una lectura de un campo de dinero de una fila del puente tiene que pasar por
 * `centavosDe('<Entidad>', '<campo>', fila.<campo>)`. Qué es «una fila del puente» no se
 * adivina por el nombre de la variable: se le pregunta al VERIFICADOR DE TIPOS. Toda
 * llamada `consultarPuente<T>('Entidad', …)` declara que `T` son filas de esa entidad, y
 * cualquier acceso `x.campo` cuyo `x` sea de tipo `T` (o `T | null`, o un elemento de
 * `T[]`) es una lectura de esa entidad.
 *
 * Es un acceso SIN convertir —un hallazgo— si `campo` es de dinero en esa entidad y el
 * acceso no es exactamente el tercer argumento de un `centavosDe` con esa entidad y ese
 * campo escritos literalmente. También cuenta desestructurarlo (`const { total_centavos }
 * = fila`), porque el valor sale del mismo sitio sin pasar por ninguna parte.
 *
 * Lo que NO ve, dicho: una fila copiada a un tipo estructuralmente igual pero con otro
 * nombre —el verificador no la relaciona con la llamada—, y un campo de dinero leído por
 * índice con una cadena que no es literal.
 */
import ts from 'typescript';

function sinEnvoltorios(nodo) {
  let actual = nodo;
  while (
    ts.isParenthesizedExpression(actual.parent) ||
    ts.isAsExpression(actual.parent) ||
    ts.isNonNullExpression(actual.parent) ||
    ts.isSatisfiesExpression?.(actual.parent)
  ) {
    actual = actual.parent;
  }
  return actual;
}

/** `precio_centavos` → `precio_pesos`. */
function gemeloHonesto(campo) {
  return campo.replace(/_centavos$/, '_pesos');
}

/** Se llama `_centavos`, llega en pesos, y su entidad tiene el gemelo honesto. */
function nombreQueMiente(camposDeLaEntidad, campo) {
  return (
    /_centavos$/.test(campo) &&
    camposDeLaEntidad?.[campo] === 'pesos' &&
    camposDeLaEntidad?.[gemeloHonesto(campo)] === 'pesos'
  );
}

function esLlamadaA(nodo, nombre) {
  return (
    ts.isCallExpression(nodo) && ts.isIdentifier(nodo.expression) && nodo.expression.text === nombre
  );
}

function simbolosDeTipo(checker, tipo) {
  const salida = [];
  const visitar = (t) => {
    if (t.isUnion?.()) {
      for (const parte of t.types) visitar(parte);
      return;
    }
    if (t.aliasSymbol !== undefined) salida.push(t.aliasSymbol);
    const s = t.getSymbol();
    if (s !== undefined) salida.push(s);
    // Un elemento de arreglo: `filas[0].campo` y `filas.map((f) => f.campo)`.
    const elemento = checker.getIndexTypeOfType?.(t, ts.IndexKind.Number);
    if (elemento !== undefined && elemento !== t) visitar(elemento);
  };
  visitar(checker.getNonNullableType(tipo));
  return salida;
}

/**
 * @param {ts.Program} programa
 * @param {Readonly<Record<string, Readonly<Record<string, 'pesos' | 'centavos'>>>>} unidades
 * @param {readonly string[]} archivos  rutas de los archivos a revisar (las de la pantalla)
 */
export function hallazgosDeUnidades(programa, unidades, archivos) {
  const checker = programa.getTypeChecker();
  const fuentes = archivos
    .map((ruta) => programa.getSourceFile(ruta))
    .filter((f) => f !== undefined);

  // 1 · Qué tipos son filas de qué entidad: de cada `consultarPuente<T>('Entidad')`.
  const entidadesDe = new Map();
  for (const fuente of fuentes) {
    const visitar = (nodo) => {
      if (
        esLlamadaA(nodo, 'consultarPuente') &&
        nodo.typeArguments?.[0] !== undefined &&
        nodo.arguments[0] !== undefined &&
        ts.isStringLiteralLike(nodo.arguments[0])
      ) {
        const entidad = nodo.arguments[0].text;
        const tipo = checker.getTypeFromTypeNode(nodo.typeArguments[0]);
        for (const simbolo of simbolosDeTipo(checker, tipo)) {
          if (!entidadesDe.has(simbolo)) entidadesDe.set(simbolo, new Set());
          entidadesDe.get(simbolo).add(entidad);
        }
      }
      ts.forEachChild(nodo, visitar);
    };
    visitar(fuente);
  }

  const entidadesDelReceptor = (expresion) => {
    const entidades = new Set();
    for (const simbolo of simbolosDeTipo(checker, checker.getTypeAtLocation(expresion))) {
      for (const e of entidadesDe.get(simbolo) ?? []) entidades.add(e);
    }
    return entidades;
  };

  const convertidoPorCentavosDe = (acceso, campo, entidades) => {
    const externo = sinEnvoltorios(acceso);
    const llamada = externo.parent;
    if (!esLlamadaA(llamada, 'centavosDe') || llamada.arguments[2] !== externo) return false;
    const [e, c] = llamada.arguments;
    return (
      e !== undefined &&
      c !== undefined &&
      ts.isStringLiteralLike(e) &&
      ts.isStringLiteralLike(c) &&
      entidades.has(e.text) &&
      c.text === campo &&
      unidades[e.text]?.[campo] !== undefined
    );
  };

  // 2 · Cada lectura de un campo de dinero de esas filas.
  const hallazgos = [];
  for (const fuente of fuentes) {
    const anotar = (nodo, campo, entidades, como) => {
      const { line } = fuente.getLineAndCharacterOfPosition(nodo.getStart(fuente));
      const unidad = [...entidades].map((e) => unidades[e]?.[campo]).find(Boolean);
      hallazgos.push({
        archivo: fuente.fileName,
        linea: line + 1,
        entidad: [...entidades].join('|'),
        campo,
        unidad,
        como,
      });
    };
    const visitar = (nodo) => {
      if (ts.isPropertyAccessExpression(nodo) || ts.isElementAccessExpression(nodo)) {
        const campo = ts.isPropertyAccessExpression(nodo)
          ? nodo.name.text
          : ts.isStringLiteralLike(nodo.argumentExpression)
            ? nodo.argumentExpression.text
            : null;
        if (campo !== null) {
          const entidades = [...entidadesDelReceptor(nodo.expression)].filter(
            (e) => unidades[e]?.[campo] !== undefined,
          );
          if (entidades.length > 0 && !convertidoPorCentavosDe(nodo, campo, new Set(entidades))) {
            anotar(nodo, campo, entidades, 'lectura sin convertir');
          } else if (entidades.some((e) => nombreQueMiente(unidades[e], campo))) {
            // Convertido bien, pero leído por el nombre que miente: el código nuevo lee
            // el gemelo honesto (`precio_pesos`), que el mapa sirve desde la 2.4.
            anotar(nodo, campo, entidades, `nombre que miente: lee ${gemeloHonesto(campo)}`);
          }
        }
      }
      if (ts.isObjectBindingPattern(nodo)) {
        const origen =
          ts.isVariableDeclaration(nodo.parent) && nodo.parent.initializer !== undefined
            ? nodo.parent.initializer
            : ts.isParameter(nodo.parent)
              ? nodo.parent
              : null;
        if (origen !== null) {
          const entidades = entidadesDelReceptor(ts.isParameter(origen) ? origen.name : origen);
          for (const elemento of nodo.elements) {
            const nombre = elemento.propertyName ?? elemento.name;
            if (!ts.isIdentifier(nombre)) continue;
            const deDinero = [...entidades].filter((e) => unidades[e]?.[nombre.text] !== undefined);
            if (deDinero.length > 0) anotar(elemento, nombre.text, deDinero, 'desestructurado');
          }
        }
      }
      ts.forEachChild(nodo, visitar);
    };
    visitar(fuente);
  }
  return hallazgos;
}
