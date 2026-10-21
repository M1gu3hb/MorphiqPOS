import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { RAICES_CON_VARIANTES } from './claves-de-consulta.ts';

/**
 * DOS PREGUNTAS DISTINTAS NO PUEDEN LLEVAR LA MISMA CLAVE DE CONSULTA.
 *
 * ── El defecto que este contrato impide ────────────────────────────────────
 * React Query decide que dos consultas son LA MISMA por su clave, y no mira qué pide cada
 * una. `['mesas']` la usaban Cocina y Configuración (`Mesa.list('-created_date', 500)`: las 16,
 * con las 4 dadas de baja) y el mesero (`Mesa.filter({ activo: true })`: las 12 de verdad).
 * Quien llegaba al mapa del mesero desde Cocina lo pintaba con el caché de la OTRA pregunta, y
 * las inactivas —que comparten coordenadas con cuatro activas— se dibujaban encima. Ninguna
 * puerta lo veía: tipos, lint y las 800 pruebas pasaban, y la pantalla abría en 200.
 *
 * ── Qué mira, y por qué así ────────────────────────────────────────────────
 * Cada llamada a `useQuery({ queryKey, queryFn })` de `apps/web/heredado`, leída con el
 * analizador de TypeScript —no con una expresión regular—, de modo que comentarios, saltos de
 * línea y espaciado no cuentan. Se compara el TEXTO impreso de la clave y el de la función:
 *
 *   1 · una misma clave con DOS funciones distintas es una colisión;
 *   2 · una raíz con variantes (`RAICES_CON_VARIANTES`) escrita a mano —`['mesas']`— es una
 *       colisión que todavía no ocurre: se escribe con su constructor (`claves.mesas.activas()`).
 *
 * ── Lo que NO puede ver, y hay que decirlo ─────────────────────────────────
 * Dos funciones DISTINTAS en el texto que piden lo mismo se cuentan como colisión: es el lado
 * seguro, y se arregla igualando el texto. Y una función que depende de una variable que NO está
 * en la clave (`queryFn: () => leer(token)` con `queryKey: ['x']`) no se detecta: aquí sólo
 * se compara lo que está escrito. Las consultas de `apps/web/src` no pasan por React Query
 * —leen por `consultarPuente` en su efecto— y no entran en este contrato.
 */

const RAIZ_HEREDADO = process.cwd().endsWith('web')
  ? join(process.cwd(), 'heredado')
  : join(process.cwd(), 'apps', 'web', 'heredado');

/**
 * Las colisiones que ya existían y viven en archivos que esta rama NO toca (otro cambio trabaja
 * en ellos). Cada una con su razón y con el arreglo, que es de una línea. La lista sólo puede
 * encogerse: una entrada que ya no colisiona hace fallar el último caso de este archivo.
 */
const COLISIONES_AJENAS: Readonly<Record<string, string>> = {
  "['ingredientes_all']":
    'Productos.jsx lee TODOS (`Ingrediente.list(…, 1000)`, inactivos incluidos) y Inventario, ' +
    'Recetas, Compras y el tablero leen los activos. Arreglo: Productos pasa a una clave propia ' +
    '(p. ej. `claves.ingredientes.todos()`).',
  "['recetas_all']":
    'Inventario.jsx pide 2 000 recetas y Productos, Recetas y el tablero 1 000. Arreglo: el ' +
    'límite entra en la clave (`claves.recetas.todas(limite)`), igual que con los gastos.',
};

interface Consulta {
  readonly archivo: string;
  readonly linea: number;
  readonly clave: string;
  readonly funcion: string;
}

function archivosDelHeredado(): readonly string[] {
  const encontrados: string[] = [];
  const recorrer = (carpeta: string): void => {
    for (const entrada of readdirSync(carpeta)) {
      if (entrada === 'node_modules') continue;
      const completa = join(carpeta, entrada);
      if (statSync(completa).isDirectory()) {
        recorrer(completa);
        continue;
      }
      if (/\.(jsx|js)$/.test(entrada)) encontrados.push(completa);
    }
  };
  recorrer(RAIZ_HEREDADO);
  return encontrados;
}

/** El texto de un nodo SIN comentarios y con el espaciado normalizado. */
function textoDe(nodo: ts.Node, fuente: ts.SourceFile): string {
  const impresora = ts.createPrinter({ removeComments: true });
  return impresora
    .printNode(ts.EmitHint.Unspecified, nodo, fuente)
    .replace(/\s+/g, ' ')
    .replace(/,\s*([\]}])/g, '$1')
    .trim();
}

function nombreDeLaPropiedad(propiedad: ts.ObjectLiteralElementLike): string | null {
  if (!ts.isPropertyAssignment(propiedad) && !ts.isMethodDeclaration(propiedad)) return null;
  const nombre = propiedad.name;
  return ts.isIdentifier(nombre) || ts.isStringLiteral(nombre) ? nombre.text : null;
}

/** Cada `useQuery({ queryKey, queryFn })` del archivo. */
function consultasDe(archivo: string): readonly Consulta[] {
  const fuente = readFileSync(archivo, 'utf8');
  const arbol = ts.createSourceFile(
    archivo,
    fuente,
    ts.ScriptTarget.Latest,
    true,
    archivo.endsWith('.jsx') ? ts.ScriptKind.JSX : ts.ScriptKind.JS,
  );
  const halladas: Consulta[] = [];
  const visitar = (nodo: ts.Node): void => {
    if (
      ts.isCallExpression(nodo) &&
      ts.isIdentifier(nodo.expression) &&
      nodo.expression.text === 'useQuery'
    ) {
      const opciones = nodo.arguments[0];
      if (opciones !== undefined && ts.isObjectLiteralExpression(opciones)) {
        let clave: ts.Node | undefined;
        let funcion: ts.Node | undefined;
        for (const propiedad of opciones.properties) {
          const nombre = nombreDeLaPropiedad(propiedad);
          if (nombre === 'queryKey' && ts.isPropertyAssignment(propiedad)) {
            clave = propiedad.initializer;
          }
          if (nombre === 'queryFn') {
            funcion = ts.isPropertyAssignment(propiedad) ? propiedad.initializer : propiedad;
          }
        }
        if (clave !== undefined && funcion !== undefined) {
          const { line } = arbol.getLineAndCharacterOfPosition(nodo.getStart());
          halladas.push({
            archivo: relative(RAIZ_HEREDADO, archivo).split('\\').join('/'),
            linea: line + 1,
            clave: textoDe(clave, arbol),
            funcion: textoDe(funcion, arbol),
          });
        }
      }
    }
    ts.forEachChild(nodo, visitar);
  };
  visitar(arbol);
  return halladas;
}

const CONSULTAS: readonly Consulta[] = archivosDelHeredado().flatMap(consultasDe);

/** Las claves que el mismo texto usa para funciones DISTINTAS, con quién las usa. */
function colisiones(): ReadonlyMap<string, readonly Consulta[]> {
  const porClave = new Map<string, Consulta[]>();
  for (const consulta of CONSULTAS) {
    porClave.set(consulta.clave, [...(porClave.get(consulta.clave) ?? []), consulta]);
  }
  const malas = new Map<string, readonly Consulta[]>();
  for (const [clave, usos] of porClave) {
    if (new Set(usos.map((uso) => uso.funcion)).size > 1) malas.set(clave, usos);
  }
  return malas;
}

function descripcion(clave: string, usos: readonly Consulta[]): string {
  return (
    `${clave}\n` +
    usos.map((uso) => `    ${uso.archivo}:${String(uso.linea)}  →  ${uso.funcion}`).join('\n')
  );
}

describe('claves de consulta de las pantallas heredadas', () => {
  it('el analizador encuentra las consultas: un contrato que no ve nada no afirma nada', () => {
    // Hoy hay más de cien; el umbral sólo evita que el contrato pase en vacío si el analizador
    // dejara de reconocer `useQuery` (por ejemplo, si se renombra el import).
    expect(CONSULTAS.length).toBeGreaterThan(60);
    const mesero = CONSULTAS.filter((c) => c.archivo === 'pages/Mesero.jsx');
    expect(mesero.length).toBeGreaterThan(3);
  });

  it('ninguna clave sirve a dos preguntas distintas (salvo las ajenas declaradas)', () => {
    const nuevas = [...colisiones()].filter(([clave]) => !(clave in COLISIONES_AJENAS));
    expect(nuevas.map(([clave, usos]) => descripcion(clave, usos))).toEqual([]);
  });

  it('una raíz con variantes no se escribe a mano: va con su constructor de `claves`', () => {
    const aMano = CONSULTAS.filter((consulta) =>
      RAICES_CON_VARIANTES.some((raiz) => consulta.clave.startsWith(`['${raiz}'`)),
    );
    expect(aMano.map((c) => `${c.archivo}:${String(c.linea)}  ${c.clave}`)).toEqual([]);
  });

  it('cada pregunta de las raíces con variantes usa un constructor, no una clave inventada', () => {
    const conRaizVariante = CONSULTAS.filter((consulta) =>
      RAICES_CON_VARIANTES.some((raiz) =>
        consulta.clave.startsWith(`claves.${raizDeConstructor(raiz)}.`),
      ),
    );
    // Si nadie usa los constructores, el contrato de arriba pasaría por no haber nada que mirar.
    expect(conRaizVariante.length).toBeGreaterThan(8);
  });

  it('las colisiones ajenas declaradas siguen existiendo: la lista sólo puede encogerse', () => {
    const vivas = new Set([...colisiones().keys()]);
    const caducadas = Object.keys(COLISIONES_AJENAS).filter((clave) => !vivas.has(clave));
    expect(caducadas).toEqual([]);
  });
});

/** El nombre del grupo de `claves` que corresponde a cada raíz con variantes. */
function raizDeConstructor(raiz: string): string {
  const grupos: Readonly<Record<string, string>> = {
    mesas: 'mesas',
    gastos_hoy: 'gastos',
    cortes_historial: 'cortes',
    registros_ventas: 'registrosVentas',
    usuarios_pos: 'usuarios',
  };
  return grupos[raiz] ?? raiz;
}
