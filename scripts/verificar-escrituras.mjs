#!/usr/bin/env node
/**
 * LA PUERTA QUE CAZA LAS PANTALLAS QUE FALLAN AL PULSAR EL BOTÓN.
 *
 *   node scripts/verificar-escrituras.mjs
 *
 * ── Por qué existe ─────────────────────────────────────────────────────────
 * Cada `api.entidades.X.create/update` de `apps/web/heredado/` acaba en
 * `/api/datos/escribir`, y el puente RECHAZA —lanzando, no ignorando— dos
 * cosas distintas:
 *
 *   · la ENTIDAD entera, si su `escritura` es `'comando'` o `'lectura'`;
 *   · el CAMPO suelto, si no está en `campos`, si es `escribible: false`, o si
 *     es un DERIVADO que sale de un `left join` al leer.
 *
 * Yo busqué a mano las doce entidades transaccionales y los campos de `Mesa` e
 * `Ingrediente`, di por buena la lista y escribí «cero escrituras bloqueadas»
 * en el informe de entrega. Era falso: quedaban cinco, en cuatro archivos que
 * mi `grep` no miraba, y cada una deja una pantalla inservible —crear un
 * producto, guardar sus modificadores, crear una estación de preparación,
 * editar una categoría—. Un `grep` que se escribe una vez comprueba lo que su
 * autor se acordó de poner; esto comprueba TODO.
 *
 * Resuelve literales, variables, condicionales y spreads. Si una expresión no
 * se puede demostrar segura, la puerta FALLA: «no analizada» nunca significa
 * «aceptada».
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import ts from 'typescript';

const MAPA = 'packages/app/src/puente/mapa.ts';
const CARPETA = 'apps/web/heredado';
const OPERACIONES = ['create', 'update', 'delete'];

// ────────────────────────────────────────────────── el mapa del puente, leído

/** Recorta un bloque `{ … }` contando llaves desde la primera. */
function bloque(texto, desde) {
  let profundidad = 0;
  for (let i = desde; i < texto.length; i += 1) {
    if (texto[i] === '{') profundidad += 1;
    else if (texto[i] === '}') {
      profundidad -= 1;
      if (profundidad === 0) return texto.slice(desde, i + 1);
    }
  }
  return texto.slice(desde);
}

function leerMapa() {
  const fuente = readFileSync(MAPA, 'utf8');
  const entidades = new Map();

  for (const m of fuente.matchAll(/^ {2}([A-Z][A-Za-z]*): \{/gm)) {
    const nombre = m[1];
    const cuerpo = bloque(fuente, m.index + m[0].length - 1);

    const escritura = /escritura: '(\w+)'/.exec(cuerpo)?.[1] ?? 'directa';

    // `campos: { … }` y `derivados: { … }` son bloques hermanos.
    const campos = new Map();
    const iCampos = cuerpo.indexOf('campos: {');
    if (iCampos !== -1) {
      const dentro = bloque(cuerpo, iCampos + 'campos: '.length);
      for (const c of dentro.matchAll(/^ {6}([a-z_0-9]+): \{([^}]*)\}/gm)) {
        campos.set(c[1], !/escribible: false/.test(c[2] ?? ''));
      }
      // `nombre: 'columna'` sin objeto: escribible.
      for (const c of dentro.matchAll(/^ {6}([a-z_0-9]+): '[^']*',$/gm)) {
        if (!campos.has(c[1])) campos.set(c[1], true);
      }
    }

    const derivados = new Set();
    const iDeriv = cuerpo.indexOf('derivados: {');
    if (iDeriv !== -1) {
      const dentro = bloque(cuerpo, iDeriv + 'derivados: '.length);
      for (const d of dentro.matchAll(/^ {6}([a-z_0-9]+): \{/gm)) derivados.add(d[1]);
    }

    const calculados = new Set();
    const iCalc = cuerpo.indexOf('calculados: {');
    if (iCalc !== -1) {
      const dentro = bloque(cuerpo, iCalc + 'calculados: '.length);
      for (const d of dentro.matchAll(/^ {6}([a-z_0-9]+): \{/gm)) calculados.add(d[1]);
    }

    entidades.set(nombre, { escritura, campos, derivados, calculados });
  }
  return entidades;
}

/**
 * Las entidades que NO viven en `mapa.ts` y tienen su propio camino.
 *
 * `ConfiguracionNegocio` es un documento JSON, no una tabla con columnas, y
 * `comandos.ts:61` sólo admite `update`: crearla o borrarla lanza. `UsuarioPOS`
 * sale de cuatro tablas y `usuarios.ts` sólo tiene LECTURA —no hay ningún
 * camino de escritura para ella en todo el puente—.
 */
const FUERA_DEL_MAPA = {
  ConfiguracionNegocio: {
    permitidas: ['update'],
    motivo: 'es un documento JSON: sólo se actualiza, no se crea ni se borra',
    camposLibres: true,
  },
  UsuarioPOS: {
    permitidas: [],
    motivo: 'sale de cuatro tablas y el puente sólo la sabe LEER: no hay camino de escritura',
    camposLibres: true,
  },
};

/**
 * Los campos que el puente añade a TODA lectura y nunca acepta al escribir.
 *
 * `id` sí viaja, pero como argumento aparte —`update(id, datos)`—, no dentro
 * del objeto; si aparece en el cuerpo, el puente lo rechaza igual.
 */
const DE_SOLO_LECTURA = ['created_date', 'updated_date', 'created_at', 'updated_at', 'id'];

// ──────────────────────────────────────────── las llamadas de sus pantallas

function archivos(raiz) {
  const salida = [];
  const pila = [raiz];
  while (pila.length > 0) {
    const actual = pila.pop();
    for (const entrada of readdirSync(actual)) {
      if (entrada === 'node_modules') continue;
      const ruta = join(actual, entrada);
      if (statSync(ruta).isDirectory()) pila.push(ruta);
      else if (/\.(jsx?|tsx?)$/.test(entrada)) salida.push(ruta);
    }
  }
  return salida;
}

function nombrePropiedad(nombre) {
  if (
    ts.isIdentifier(nombre) ||
    ts.isStringLiteral(nombre) ||
    ts.isNoSubstitutionTemplateLiteral(nombre)
  ) {
    return nombre.text;
  }
  return null;
}

/** Reconoce únicamente `api.entidades.Entidad.create/update/delete(…)`. */
function llamadaDelPuente(nodo) {
  if (!ts.isCallExpression(nodo) || !ts.isPropertyAccessExpression(nodo.expression)) return null;
  const operacion = nodo.expression.name.text;
  if (!OPERACIONES.includes(operacion)) return null;

  const accesoEntidad = nodo.expression.expression;
  if (!ts.isPropertyAccessExpression(accesoEntidad)) return null;
  const accesoEntidades = accesoEntidad.expression;
  if (!ts.isPropertyAccessExpression(accesoEntidades)) return null;
  if (
    accesoEntidades.name.text !== 'entidades' ||
    !ts.isIdentifier(accesoEntidades.expression) ||
    accesoEntidades.expression.text !== 'api'
  ) {
    return null;
  }
  return { entidad: accesoEntidad.name.text, operacion };
}

const RUTA_SANITIZADOR_MESA = join(CARPETA, 'utils', 'mesaConfigUtils.js');

/**
 * Lee la lista real del único sanitizador previo a una escritura.
 *
 * Si la función deja de filtrar con ese Set, no se reconoce y las llamadas que
 * dependan de ella fallan como cuerpos opacos.
 */
function camposSanitizadosDeMesa() {
  const fuente = readFileSync(RUTA_SANITIZADOR_MESA, 'utf8');
  if (
    !/export function soloCamposEditablesMesa\s*\(/.test(fuente) ||
    !/CAMPOS_EDITABLES_MESA\.has\(clave\)/.test(fuente)
  ) {
    throw new Error('soloCamposEditablesMesa ya no demuestra que filtre por su lista blanca.');
  }
  const arreglo = /const CAMPOS_EDITABLES_MESA = new Set\(\[([\s\S]*?)\]\);/.exec(fuente)?.[1];
  if (arreglo === undefined) throw new Error('No se pudo leer CAMPOS_EDITABLES_MESA.');
  return new Set([...arreglo.matchAll(/'([a-z_0-9]+)'/g)].map((m) => m[1]));
}

const CAMPOS_SANITIZADOS_MESA = camposSanitizadosDeMesa();

function esContenedorLexico(nodo) {
  return ts.isSourceFile(nodo) || ts.isFunctionLike(nodo);
}

/** Expresiones asignadas a un identificador antes de la llamada, en su ámbito. */
function valoresDeIdentificador(nombre, desde) {
  for (let contenedor = desde.parent; contenedor !== undefined; contenedor = contenedor.parent) {
    if (!esContenedorLexico(contenedor)) continue;
    const valores = [];
    function visitar(nodo) {
      if (nodo.getStart() >= desde.getStart()) return;
      if (
        ts.isVariableDeclaration(nodo) &&
        ts.isIdentifier(nodo.name) &&
        nodo.name.text === nombre &&
        nodo.initializer !== undefined
      ) {
        valores.push(nodo.initializer);
      }
      if (
        ts.isBinaryExpression(nodo) &&
        nodo.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        ts.isIdentifier(nodo.left) &&
        nodo.left.text === nombre
      ) {
        valores.push(nodo.right);
      }
      ts.forEachChild(nodo, visitar);
    }
    visitar(contenedor);
    if (valores.length > 0) return valores;
  }
  return [];
}

function unirResultados(resultados) {
  const claves = new Set();
  const opacos = [];
  for (const resultado of resultados) {
    for (const clave of resultado.claves) claves.add(clave);
    opacos.push(...resultado.opacos);
  }
  return { claves, opacos };
}

/** Resuelve todas las claves posibles de una expresión que produce un objeto. */
function resolverClaves(expresion, llamada, visitados = new Set()) {
  let actual = expresion;
  while (
    ts.isParenthesizedExpression(actual) ||
    ts.isAsExpression(actual) ||
    ts.isTypeAssertionExpression(actual) ||
    ts.isSatisfiesExpression(actual)
  ) {
    actual = actual.expression;
  }

  if (ts.isObjectLiteralExpression(actual)) {
    const claves = new Set();
    const opacos = [];
    for (const propiedad of actual.properties) {
      if (ts.isSpreadAssignment(propiedad)) {
        const resuelta = resolverClaves(propiedad.expression, llamada, visitados);
        for (const clave of resuelta.claves) claves.add(clave);
        opacos.push(...resuelta.opacos);
        continue;
      }
      const clave = nombrePropiedad(propiedad.name);
      if (clave === null) opacos.push(propiedad.getText());
      else claves.add(clave);
    }
    return { claves, opacos };
  }

  if (ts.isConditionalExpression(actual)) {
    return unirResultados([
      resolverClaves(actual.whenTrue, llamada, new Set(visitados)),
      resolverClaves(actual.whenFalse, llamada, new Set(visitados)),
    ]);
  }

  if (ts.isIdentifier(actual)) {
    const marca = `${actual.text}@${String(actual.getStart())}`;
    if (visitados.has(marca)) return { claves: new Set(), opacos: [`ciclo en ${actual.text}`] };
    const siguientes = new Set(visitados);
    siguientes.add(marca);
    const valores = valoresDeIdentificador(actual.text, llamada);
    if (valores.length === 0) return { claves: new Set(), opacos: [actual.getText()] };
    return unirResultados(valores.map((valor) => resolverClaves(valor, llamada, siguientes)));
  }

  if (ts.isCallExpression(actual)) {
    if (
      ts.isIdentifier(actual.expression) &&
      actual.expression.text === 'soloCamposEditablesMesa' &&
      actual.arguments.length === 1
    ) {
      return { claves: new Set(CAMPOS_SANITIZADOS_MESA), opacos: [] };
    }
    if (
      ts.isPropertyAccessExpression(actual.expression) &&
      ts.isIdentifier(actual.expression.expression) &&
      actual.expression.expression.text === 'Object' &&
      actual.expression.name.text === 'assign'
    ) {
      return unirResultados(
        actual.arguments.map((argumento) => resolverClaves(argumento, llamada, new Set(visitados))),
      );
    }
  }

  return { claves: new Set(), opacos: [actual.getText().slice(0, 100)] };
}

const ENTIDADES = leerMapa();
const rechazos = [];
let miradas = 0;

for (const ruta of archivos(CARPETA)) {
  const texto = readFileSync(ruta, 'utf8');
  const fuente = ts.createSourceFile(
    ruta,
    texto,
    ts.ScriptTarget.Latest,
    true,
    ruta.endsWith('.jsx') ? ts.ScriptKind.JSX : ts.ScriptKind.JS,
  );

  function visitar(nodo) {
    const reconocida = llamadaDelPuente(nodo);
    if (reconocida === null) {
      ts.forEachChild(nodo, visitar);
      return;
    }
    const { entidad, operacion } = reconocida;
    const linea = fuente.getLineAndCharacterOfPosition(nodo.getStart()).line + 1;
    const mapa = ENTIDADES.get(entidad);
    miradas += 1;

    const especial = FUERA_DEL_MAPA[entidad];
    if (especial !== undefined) {
      if (!especial.permitidas.includes(operacion)) {
        rechazos.push({ ruta, linea, entidad, operacion, motivo: especial.motivo });
      }
      ts.forEachChild(nodo, visitar);
      return;
    }
    if (mapa === undefined) {
      rechazos.push({ ruta, linea, entidad, operacion, motivo: 'no existe en el mapa del puente' });
      ts.forEachChild(nodo, visitar);
      return;
    }
    if (mapa.escritura !== 'directa') {
      rechazos.push({
        ruta,
        linea,
        entidad,
        operacion,
        motivo: `la entidad es «${mapa.escritura}»: se escribe con su comando`,
      });
      ts.forEachChild(nodo, visitar);
      return;
    }
    if (operacion === 'delete') {
      ts.forEachChild(nodo, visitar);
      return;
    }

    const cuerpo = nodo.arguments[operacion === 'update' ? 1 : 0];
    if (cuerpo === undefined) {
      rechazos.push({ ruta, linea, entidad, operacion, motivo: 'falta el cuerpo de la escritura' });
      ts.forEachChild(nodo, visitar);
      return;
    }
    const resuelto = resolverClaves(cuerpo, nodo);
    for (const opaco of resuelto.opacos) {
      rechazos.push({
        ruta,
        linea,
        entidad,
        operacion,
        motivo: `cuerpo no resoluble de forma estática: ${opaco}`,
      });
    }

    for (const clave of resuelto.claves) {
      const escribible = mapa.campos.get(clave);
      let motivo = null;
      if (mapa.derivados.has(clave)) motivo = 'es un DERIVADO: sale de un join al leer';
      else if (mapa.calculados.has(clave)) motivo = 'es CALCULADO por el servidor';
      else if (DE_SOLO_LECTURA.includes(clave)) motivo = 'lo pone la base, no el cliente';
      else if (escribible === undefined) motivo = 'no es un campo del puente';
      else if (escribible === false) motivo = 'está declarado «escribible: false»';
      if (motivo !== null) {
        rechazos.push({ ruta, linea, entidad, operacion, campo: clave, motivo });
      }
    }
    ts.forEachChild(nodo, visitar);
  }

  visitar(fuente);
}

const salida = [];
salida.push(`Miradas ${miradas} escrituras de ${CARPETA} contra el mapa del puente.`);

if (rechazos.length === 0) {
  salida.push('', 'Ninguna escritura la rechaza el puente.');
  process.stdout.write(`${salida.join('\n')}\n`);
  process.exit(0);
}

salida.push(
  '',
  `EL PUENTE RECHAZA ${rechazos.length} ESCRITURAS. Cada una es una pantalla que`,
  'falla al pulsar el botón, o que falla en silencio si lleva un catch encima.',
  '',
);
for (const r of rechazos) {
  const campo = r.campo === undefined ? '' : ` · «${r.campo}»`;
  salida.push(`  ${r.ruta}:${r.linea}`);
  salida.push(`      ${r.entidad}.${r.operacion}${campo} — ${r.motivo}`);
}
process.stdout.write(`${salida.join('\n')}\n`);
process.exit(1);
