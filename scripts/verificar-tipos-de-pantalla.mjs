#!/usr/bin/env node
/**
 * LA PUERTA QUE CAZA LO QUE MATA UNA PANTALLA EN LA MANO Y NO EN NINGUNA PUERTA.
 *
 *   node scripts/verificar-tipos-de-pantalla.mjs
 *
 * ── El defecto que la obliga a existir, medido en producción ───────────────
 * `MapaDeMesas` —la pantalla que un mesero mira cuarenta veces por turno—
 * declaraba:
 *
 *     readonly numero: string;
 *
 * y el puente sirve ese campo con `conversion: 'entero'`, o sea un NÚMERO. El
 * orden de las mesas hacía `a.numero.localeCompare(b.numero, …)`, y en cuanto
 * llegaban las mesas la pantalla moría con:
 *
 *     TypeError: e.numero.localeCompare is not a function
 *
 * El mesero entraba con su PIN y lo que veía era la página de error del
 * navegador. **Ninguna de las treinta puertas lo vio**, y no por descuido:
 *
 *   · TypeScript CREE la declaración. `consultarPuente<T>()` es un genérico sin
 *     validación en ejecución: lo que el servidor manda de verdad no lo
 *     comprueba nadie, así que `numero: string` compila perfecto;
 *   · el HTML abría en 200 y la respuesta era `{ok:true}`, así que las puertas
 *     que miran la red daban verde;
 *   · la e2e comprobaba el rótulo «Mesas», que se pinta ANTES de que lleguen los
 *     datos — la pantalla moría un segundo después de que la prueba pasara;
 *   · y un error de consola no es un 500: el servidor NI SE ENTERA.
 *
 * Es la clase entera de defecto, no un caso: cualquier campo declarado con un
 * tipo distinto del que el puente entrega revienta en cuanto alguien lo usa como
 * lo que cree que es. Se puede comprobar ESTÁTICAMENTE, y es lo que hace esto.
 *
 * ── Qué compara ───────────────────────────────────────────────────────────
 * Por cada `consultarPuente<T>('Entidad', …)` de `apps/web/src`: busca la
 * interfaz `T` en ese archivo y compara cada propiedad suya con la `conversion`
 * del campo del mismo nombre en `mapa.ts`.
 *
 *     texto · fecha · dia                     → string
 *     entero · dinero · decimal · puntos_base → number
 *     booleano                                → boolean
 *     json                                    → opaco, no se compara
 *
 * `null` y `undefined` en la unión se ignoran: todo campo del puente puede
 * llegar nulo, y declararlo es correcto. Una unión de literales de cadena
 * —`'libre' | 'ocupada'`— es `string`, que es lo que llega.
 *
 * ── Lo que NO comprueba, dicho en vez de supuesto ─────────────────────────
 * · Los campos que la pantalla declara y el puente no mapea: de eso se encarga
 *   `verify:lecturas`. Aquí se cuentan, y el total se imprime.
 * · Las entidades que no viven en `mapa.ts`, que se nombran al terminar.
 * · Un tipo que no es primitivo —un arreglo, un objeto, un `Record`—: se cuenta
 *   como no comparable y el total se imprime, porque un cupo silencioso hace
 *   creer que se miró todo.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)));
const MAPA = join(RAIZ, 'packages', 'app', 'src', 'puente', 'mapa.ts');
const TIPOS = join(RAIZ, 'packages', 'app', 'src', 'puente', 'tipos.ts');
const PANTALLAS = join(RAIZ, 'apps', 'web', 'src');

/** Lo que cada conversión entrega AL NAVEGADOR. */
const TIPO_DE_CONVERSION = {
  texto: 'string',
  fecha: 'string',
  dia: 'string',
  entero: 'number',
  dinero: 'number',
  decimal: 'number',
  puntos_base: 'number',
  booleano: 'boolean',
  json: null,
};

/** El bloque `{…}` que empieza en `desde`, con sus llaves equilibradas. */
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

/** Los campos automáticos, leídos de donde están y no tecleados aquí. */
function camposAutomaticos() {
  const fuente = readFileSync(TIPOS, 'utf8');
  const i = fuente.indexOf('export const CAMPOS_AUTOMATICOS');
  const cuerpo = bloque(fuente, fuente.indexOf('{', i));
  const campos = new Map();
  for (const m of cuerpo.matchAll(/^ {2}([a-z_0-9]+): \{([^}]*)\}/gm)) {
    const conversion = /conversion: '(\w+)'/.exec(m[2] ?? '')?.[1];
    if (conversion !== undefined) campos.set(m[1], conversion);
  }
  return campos;
}

/**
 * `entidad → campo → conversion`, con sus derivados y sus calculados.
 *
 * Los tres grupos llegan al navegador por la misma respuesta y con la misma
 * conversión, así que para esto son lo mismo.
 */
function leerMapa() {
  const fuente = readFileSync(MAPA, 'utf8');
  const automaticos = camposAutomaticos();
  const entidades = new Map();

  for (const m of fuente.matchAll(/^ {2}([A-Z][A-Za-z]*): \{/gm)) {
    const nombre = m[1];
    const cuerpo = bloque(fuente, m.index + m[0].length - 1);
    const campos = new Map();

    for (const grupo of ['campos', 'derivados', 'calculados']) {
      const i = cuerpo.indexOf(`${grupo}: {`);
      if (i === -1) continue;
      const dentro = bloque(cuerpo, i + `${grupo}: `.length);
      // Un campo puede ocupar varias líneas; se recorta desde su nombre.
      for (const c of dentro.matchAll(/^ {6}([a-z_0-9]+): \{/gm)) {
        const suyo = bloque(dentro, c.index + c[0].length - 1);
        const conversion = /conversion: '(\w+)'/.exec(suyo)?.[1];
        if (conversion !== undefined) campos.set(c[1], conversion);
        // Una CONSTANTE viaja como el texto que dice.
        else if (/constante: '/.test(suyo)) campos.set(c[1], 'texto');
      }
    }

    // `...AUTO` y `...soloAutomaticos([...])`: los que el spread trae.
    if (/\.\.\.AUTO\b/.test(cuerpo)) {
      for (const [campo, conversion] of automaticos) campos.set(campo, conversion);
    }
    const soloAuto = /\.\.\.soloAutomaticos\(\[([^\]]*)\]\)/.exec(cuerpo);
    if (soloAuto !== null) {
      for (const c of (soloAuto[1] ?? '').matchAll(/'([a-z_0-9]+)'/g)) {
        const conversion = automaticos.get(c[1]);
        if (conversion !== undefined) campos.set(c[1], conversion);
      }
    }

    entidades.set(nombre, campos);
  }
  return entidades;
}

/** Los `.tsx` y `.ts` de las pantallas, recursivamente y sin sus pruebas. */
function archivosDePantalla(carpeta) {
  const salida = [];
  for (const entrada of readdirSync(carpeta, { withFileTypes: true })) {
    const ruta = join(carpeta, entrada.name);
    if (entrada.isDirectory()) salida.push(...archivosDePantalla(ruta));
    else if (/\.tsx?$/.test(entrada.name) && !/\.test\.tsx?$/.test(entrada.name)) {
      salida.push(ruta);
    }
  }
  return salida;
}

/**
 * El tipo declarado, reducido a las clases que de verdad importan.
 *
 * Se descartan `null` y `undefined` —todo campo del puente puede llegar nulo— y
 * lo que no es primitivo se marca como `otro`, que no se compara.
 */
function clasesDelTipo(nodo) {
  const partes = ts.isUnionTypeNode(nodo) ? nodo.types : [nodo];
  const clases = new Set();
  for (const parte of partes) {
    const k = parte.kind;
    if (k === ts.SyntaxKind.NullKeyword || k === ts.SyntaxKind.UndefinedKeyword) continue;
    if (ts.isLiteralTypeNode(parte)) {
      const l = parte.literal;
      if (l.kind === ts.SyntaxKind.NullKeyword) continue;
      if (ts.isStringLiteral(l)) clases.add('string');
      else if (ts.isNumericLiteral(l)) clases.add('number');
      else if (l.kind === ts.SyntaxKind.TrueKeyword || l.kind === ts.SyntaxKind.FalseKeyword) {
        clases.add('boolean');
      } else clases.add('otro');
      continue;
    }
    if (k === ts.SyntaxKind.StringKeyword) clases.add('string');
    else if (k === ts.SyntaxKind.NumberKeyword) clases.add('number');
    else if (k === ts.SyntaxKind.BooleanKeyword) clases.add('boolean');
    else clases.add('otro');
  }
  return clases;
}

const mapa = leerMapa();
const fallos = [];
let comparados = 0;
let noComparables = 0;
let fueraDelMapa = 0;
let lecturas = 0;
let sinInterfaz = 0;
const entidadesDesconocidas = new Set();

for (const archivo of archivosDePantalla(PANTALLAS)) {
  const texto = readFileSync(archivo, 'utf8');
  if (!texto.includes('consultarPuente')) continue;

  const fuente = ts.createSourceFile(
    archivo,
    texto,
    ts.ScriptTarget.ESNext,
    true,
    ts.ScriptKind.TSX,
  );
  const declaradas = new Map();
  const pedidos = [];

  const recorrer = (nodo) => {
    if (ts.isInterfaceDeclaration(nodo)) declaradas.set(nodo.name.text, nodo);
    if (ts.isTypeAliasDeclaration(nodo) && ts.isTypeLiteralNode(nodo.type)) {
      declaradas.set(nodo.name.text, nodo.type);
    }
    if (
      ts.isCallExpression(nodo) &&
      ts.isIdentifier(nodo.expression) &&
      nodo.expression.text === 'consultarPuente' &&
      nodo.typeArguments?.length === 1 &&
      nodo.arguments.length > 0
    ) {
      const tipo = nodo.typeArguments[0];
      const primero = nodo.arguments[0];
      if (ts.isTypeReferenceNode(tipo) && ts.isStringLiteral(primero)) {
        pedidos.push({ tipo: tipo.typeName.getText(fuente), entidad: primero.text });
      }
    }
    ts.forEachChild(nodo, recorrer);
  };
  recorrer(fuente);

  for (const pedido of pedidos) {
    lecturas += 1;
    const campos = mapa.get(pedido.entidad);
    if (campos === undefined) {
      entidadesDesconocidas.add(pedido.entidad);
      continue;
    }
    const declarada = declaradas.get(pedido.tipo);
    if (declarada === undefined) {
      sinInterfaz += 1;
      continue;
    }

    for (const miembro of declarada.members) {
      if (!ts.isPropertySignature(miembro) || miembro.type === undefined) continue;
      const nombre = miembro.name.getText(fuente).replace(/['"]/g, '');
      const conversion = campos.get(nombre);
      if (conversion === undefined) {
        fueraDelMapa += 1;
        continue;
      }
      const esperado = TIPO_DE_CONVERSION[conversion];
      if (esperado === undefined || esperado === null) continue;

      const clases = clasesDelTipo(miembro.type);
      if (clases.size === 0 || clases.has('otro')) {
        noComparables += 1;
        continue;
      }
      comparados += 1;
      if (!clases.has(esperado) || clases.size > 1) {
        fallos.push(
          `${relative(RAIZ, archivo).replace(/\\/g, '/')} · ${pedido.entidad}.${nombre} ` +
            `declara «${[...clases].sort().join(' | ')}» y el puente sirve «${esperado}» ` +
            `(conversion ${conversion})`,
        );
      }
    }
  }
}

const resumen =
  `${String(lecturas)} lectura(s) del puente · ${String(comparados)} campo(s) comparados · ` +
  `${String(noComparables)} no comparables · ${String(fueraDelMapa)} fuera del mapa · ` +
  `${String(sinInterfaz)} sin interfaz en su archivo`;

if (fallos.length > 0) {
  console.error(`TIPOS-DE-PANTALLA: ${String(fallos.length)} campo(s) con el tipo equivocado\n`);
  for (const fallo of [...new Set(fallos)].sort()) console.error(`  · ${fallo}`);
  console.error(
    '\nUn campo declarado con otro tipo del que el puente entrega revienta en cuanto alguien lo\n' +
      'usa como lo que cree que es —un `.localeCompare` sobre un número mata la pantalla entera—,\n' +
      'y ninguna otra puerta lo ve: TypeScript cree la declaración, el HTML abre en 200 y un error\n' +
      'de consola no llega al servidor. Arregla la DECLARACIÓN, o la conversión del mapa.',
  );
  console.error(`\ntipos de pantalla · ${resumen}`);
  process.exit(1);
}

console.log(`OK · tipos de pantalla · ${resumen}`);
if (entidadesDesconocidas.size > 0) {
  console.log(`  fuera de mapa.ts: ${[...entidadesDesconocidas].sort().join(', ')}`);
}
