import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * LAS PANTALLAS QUE PINTAN MESAS USAN LA REGLA DE `mesas-del-mapa.ts`, y no una suya.
 *
 * `mesas-del-mapa.test.ts` prueba la regla (sólo mesas en servicio, de la zona que se mira).
 * Eso no sirve de nada si una pantalla deja de llamarla: la regla seguiría en verde y el mapa
 * volvería a pintar las dadas de baja. Este contrato ata cada pantalla a su USO:
 *
 *   · Mesero            — la lectura lleva la clave del salón en servicio y el plano sale de
 *                         `mesasDelPlano`;
 *   · Configuración     — la lectura lleva la clave de «todas» y tanto el lienzo como la lista de
 *                         móvil reciben `mesasDelPlano(mesas, zona)`, no la lista cruda;
 *   · Mapa de mesas     — pide al puente sólo las activas y las filtra otra vez al recibirlas;
 *   · Cambiar de mesa   — idem: no ofrece de destino una mesa dada de baja.
 *
 * Se lee con el analizador de TypeScript y sin comentarios, para que un cambio de formato no
 * cuente y un comentario que nombre la función no la dé por usada.
 */

const RAIZ_WEB = process.cwd().endsWith('web') ? process.cwd() : join(process.cwd(), 'apps', 'web');

function leer(ruta: string): ts.SourceFile {
  const archivo = join(RAIZ_WEB, ruta);
  const tipo = archivo.endsWith('.tsx')
    ? ts.ScriptKind.TSX
    : archivo.endsWith('.jsx')
      ? ts.ScriptKind.JSX
      : ts.ScriptKind.TS;
  return ts.createSourceFile(
    archivo,
    readFileSync(archivo, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    tipo,
  );
}

const impresora = ts.createPrinter({ removeComments: true });
/**
 * El texto de un nodo sin comentarios y SIN ningún espacio: así partir una línea, sangrar de
 * otro modo o dejar una coma al final no hace fallar el contrato (y por eso lo que se compara
 * se escribe también sin espacios).
 */
function texto(nodo: ts.Node, fuente: ts.SourceFile): string {
  return impresora
    .printNode(ts.EmitHint.Unspecified, nodo, fuente)
    .replace(/\s+/g, '')
    .replace(/,([)\]}])/g, '$1');
}

/** Todos los nodos del árbol que cumplen `quiero`. */
function buscar<T extends ts.Node>(
  fuente: ts.SourceFile,
  quiero: (nodo: ts.Node) => nodo is T,
): T[] {
  const halladas: T[] = [];
  const visitar = (nodo: ts.Node): void => {
    if (quiero(nodo)) halladas.push(nodo);
    ts.forEachChild(nodo, visitar);
  };
  visitar(fuente);
  return halladas;
}

/** El inicializador de `const <nombre> = …`, impreso. */
function inicializadorDe(fuente: ts.SourceFile, nombre: string): string[] {
  return buscar(
    fuente,
    (n): n is ts.VariableDeclaration =>
      ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === nombre,
  ).flatMap((d) => (d.initializer === undefined ? [] : [texto(d.initializer, fuente)]));
}

/** Los `useQuery({…})` cuya función contiene `fragmentoDeLaFuncion`: su clave y su función, impresas. */
function consultasQueLeen(
  fuente: ts.SourceFile,
  fragmentoDeLaFuncion: string,
): { readonly clave: string; readonly funcion: string }[] {
  const consultas: { clave: string; funcion: string }[] = [];
  for (const llamada of buscar(
    fuente,
    (n): n is ts.CallExpression =>
      ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'useQuery',
  )) {
    const opciones = llamada.arguments[0];
    if (opciones === undefined || !ts.isObjectLiteralExpression(opciones)) continue;
    let clave = '';
    let funcion = '';
    for (const propiedad of opciones.properties) {
      if (!ts.isPropertyAssignment(propiedad) || !ts.isIdentifier(propiedad.name)) continue;
      if (propiedad.name.text === 'queryKey') clave = texto(propiedad.initializer, fuente);
      if (propiedad.name.text === 'queryFn') funcion = texto(propiedad.initializer, fuente);
    }
    if (funcion.includes(fragmentoDeLaFuncion)) consultas.push({ clave, funcion });
  }
  return consultas;
}

/** Las props de cada `<Componente … />` del archivo, impresas por nombre. */
function propsDe(fuente: ts.SourceFile, componente: string): Record<string, string>[] {
  return buscar(
    fuente,
    (n): n is ts.JsxSelfClosingElement | ts.JsxOpeningElement =>
      (ts.isJsxSelfClosingElement(n) || ts.isJsxOpeningElement(n)) &&
      n.tagName.getText(fuente) === componente,
  ).map((elemento) => {
    const props: Record<string, string> = {};
    for (const atributo of elemento.attributes.properties) {
      if (!ts.isJsxAttribute(atributo) || atributo.initializer === undefined) continue;
      const valor = atributo.initializer;
      props[atributo.name.getText(fuente)] = ts.isJsxExpression(valor)
        ? valor.expression === undefined
          ? ''
          : texto(valor.expression, fuente)
        : texto(valor, fuente);
    }
    return props;
  });
}

/** Las llamadas `consultarPuente<…>('Mesa', { … })` del archivo: el objeto de opciones, impreso por propiedad. */
function lecturasDeMesa(fuente: ts.SourceFile): Record<string, string>[] {
  return buscar(
    fuente,
    (n): n is ts.CallExpression =>
      ts.isCallExpression(n) &&
      ts.isIdentifier(n.expression) &&
      n.expression.text === 'consultarPuente' &&
      n.arguments[0] !== undefined &&
      ts.isStringLiteral(n.arguments[0]) &&
      n.arguments[0].text === 'Mesa',
  ).map((llamada) => {
    const opciones = llamada.arguments[1];
    const propiedades: Record<string, string> = {};
    if (opciones !== undefined && ts.isObjectLiteralExpression(opciones)) {
      for (const propiedad of opciones.properties) {
        if (ts.isPropertyAssignment(propiedad) && ts.isIdentifier(propiedad.name)) {
          propiedades[propiedad.name.text] = texto(propiedad.initializer, fuente);
        }
      }
    }
    return propiedades;
  });
}

describe('el mapa del mesero', () => {
  const mesero = leer('heredado/pages/Mesero.jsx');

  it('lee el salón EN SERVICIO con su propia clave, no con la de las demás pantallas', () => {
    const lecturas = consultasQueLeen(mesero, 'Mesa.filter');
    expect(lecturas).toHaveLength(1);
    expect(lecturas[0]?.clave).toBe('claves.mesas.activas()');
    expect(lecturas[0]?.funcion).toContain('activo:true');
  });

  it('el plano sale de `mesasDelPlano` (activas, de la zona que se mira), y lo reciben el lienzo y la rejilla', () => {
    expect(inicializadorDe(mesero, 'mesasDeLaZona')).toEqual([
      'mesasDelPlano(mesas||[],zonaActiva)',
    ]);
    // DP-9.6: lo que se pinta es ese plano sin las mesas absorbidas en una unión.
    expect(inicializadorDe(mesero, 'mesasZona').join('')).toContain('sinAbsorbidas(mesasDeLaZona)');
    expect(propsDe(mesero, 'MesaGridMobile').map((p) => p['mesas'])).toEqual(['mesasZona']);
    // El lienzo de escritorio pinta cada mesa de `mesasZona`.
    expect(texto(mesero, mesero)).toContain('mesasZona.map((mesa)=>');
  });

  it('las pestañas de zona cuentan sólo mesas en servicio', () => {
    expect(inicializadorDe(mesero, 'zonasConCount')).toEqual([
      'zonasConMesas(mesas||[],zonasDelNegocio([],mesas||[],ZONAS_MESA)).map(({zona,cuantas})=>({zona,count:cuantas}))',
    ]);
  });
});

describe('el editor de mesas de Configuración', () => {
  const configuracion = leer('heredado/pages/Configuracion.jsx');

  it('las zonas son las del negocio, y el diálogo de la mesa recibe esas mismas (DP-5)', () => {
    expect(inicializadorDe(configuracion, 'zonasDelEditor')).toEqual([
      'zonasDelNegocio(zonasLeidas,mesasActivas,ZONAS_MESA)',
    ]);
    expect(propsDe(configuracion, 'MesaEditDialog').map((p) => p['zonas'])).toEqual([
      'zonasDelEditor',
    ]);
    expect(texto(configuracion, configuracion)).toContain('zonasDelEditor.map((z)=>');
  });

  it('lee TODAS las mesas con la clave de «todas»: es el único que necesita las dadas de baja', () => {
    const lecturas = consultasQueLeen(configuracion, 'Mesa.list');
    expect(lecturas).toHaveLength(1);
    expect(lecturas[0]?.clave).toBe('claves.mesas.todas()');
  });

  it('el lienzo, la lista de móvil y las pestañas reciben mesas en servicio de UNA zona', () => {
    expect(inicializadorDe(configuracion, 'mesasFiltradas')).toEqual([
      'mesasDelPlano(mesas,zonaFiltro)',
    ]);
    expect(propsDe(configuracion, 'MesaMapEditor').map((p) => p['mesas'])).toEqual([
      'mesasFiltradas',
    ]);
    expect(propsDe(configuracion, 'MesaListMobile').map((p) => p['mesas'])).toEqual([
      'mesasFiltradas',
    ]);
  });

  it('mientras la primera lectura no llega, el editor espera: no se declara «sin mesas»', () => {
    expect(propsDe(configuracion, 'MesaMapEditor').map((p) => p['cargando'])).toEqual([
      'cargandoMesas',
    ]);
    expect(propsDe(configuracion, 'MesaListMobile').map((p) => p['cargando'])).toEqual([
      'cargandoMesas',
    ]);
    // Y la lectura no se siembra con `initialData: []`, que la daba por respondida.
    const lectura = buscar(
      configuracion,
      (n): n is ts.CallExpression =>
        ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'useQuery',
    ).filter((llamada) => texto(llamada, configuracion).includes('claves.mesas.todas()'));
    expect(lectura).toHaveLength(1);
    expect(texto(lectura[0] as ts.Node, configuracion)).not.toContain('initialData');
  });

  it('la mesa nueva nace en un hueco libre del lienzo, no por cuántas mesas hay', () => {
    expect(texto(configuracion, configuracion)).toContain(
      'siguientePosicionLibre(mesasDelPlano(mesas,zonaFiltro))',
    );
  });
});

describe('las pantallas nuevas del restaurante', () => {
  it('el mapa de mesas pide sólo las activas y las filtra otra vez al recibirlas', () => {
    const mapa = leer('src/restaurante/MapaDeMesas.tsx');
    const lecturas = lecturasDeMesa(mapa);
    expect(lecturas).toHaveLength(1);
    expect(lecturas[0]?.['filtro']).toBe('{activo:true}');
    expect(texto(mapa, mapa)).toContain('setMesas(soloMesasEnServicio(filas))');
  });

  it('«Cambiar de mesa» no ofrece de destino una mesa dada de baja', () => {
    const acciones = leer('src/restaurante/AccionesDeLaMesa.tsx');
    const lecturas = lecturasDeMesa(acciones);
    expect(lecturas).toHaveLength(1);
    expect(lecturas[0]?.['filtro']).toBe('{activo:true}');
  });
});
