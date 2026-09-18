import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ErrorDominio } from '@morphiqpos/contracts/errores';
import {
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type CompiledQuery,
  type DatabaseConnection,
  type Driver,
  type QueryResult,
} from 'kysely';
import { describe, expect, it } from 'vitest';

import type { Transaccion } from '../cliente.ts';
import type { Esquema } from '../esquema.ts';
import { abrirToma, anotarConteo, cerrarToma, diferenciasDeToma } from './tomas-inventario.ts';

/**
 * F-106 · El repositorio de la toma física, probado POR SÍ MISMO.
 *
 * ── Por qué hacía falta, si ya lo recorrían veinte pruebas ─────────────────
 * `abarrotes/conteo.test.ts` lo atraviesa entero por los tres comandos, y eso
 * prueba que el conteo FUNCIONA. Lo que no prueba es lo que este archivo viene a
 * fijar: que cada función acota por organización, que los estados que escribe
 * caben en el `check` de la 061, que recapturar no deja dos renglones, y qué
 * pasa exactamente al cerrar una toma ya cerrada. Todo eso son propiedades DEL
 * SQL, y contra el doble en memoria de los comandos son invisibles: esa base no
 * modela `check`, no modela índices únicos y no se queja de un `where` que falta
 * — simplemente devuelve más filas.
 *
 * ── Por qué un Kysely de verdad con el driver falsificado ──────────────────
 * Es la técnica que ya usa `stock.test.ts` en esta misma carpeta, y es la única
 * que deja afirmar sobre el SQL COMPILADO. Un `where` olvidado se ve aquí como
 * un parámetro que no está; contra un doble en memoria se ve como una prueba que
 * pasa. La grabadora va copiada y no compartida: extraerla obliga a tocar las
 * otras pruebas que ya la llevan, y ése es un cambio aparte. Queda dicho en vez
 * de hacerse a medias.
 *
 * ── Lo que este archivo NO prueba, dicho antes de que parezca que sí ───────
 * No corre contra Postgres. Que el `check` rechace un estado inventado o que el
 * `unique` exista de verdad se comprueba LEYENDO las migraciones, no
 * ejecutándolas: son un cerco de texto, no una demostración.
 */

const AQUI = dirname(fileURLToPath(import.meta.url));
const MIGRACIONES = join(AQUI, '../migraciones/sql');
const FUENTE = join(AQUI, 'tomas-inventario.ts');
/** Los comandos viven en otro paquete y aquí se LEEN como texto, no se importan. */
const CODIGO_DE_COMANDOS = join(AQUI, '../../../app/src');

const ORG = '11111111-1111-4111-8111-111111111111';
const ALMACEN = '22222222-2222-4222-8222-222222222222';
const TOMA = '33333333-3333-4333-8333-333333333333';
const INSUMO = '44444444-4444-4444-8444-444444444444';
const EMPLEADO = '55555555-5555-4555-8555-555555555555';
const ZONA = '66666666-6666-4666-8666-666666666666';
const AHORA = new Date('2026-09-16T17:00:00.000Z');

// ── El driver que graba en vez de hablar con Postgres ──────────────────────

interface Respuesta {
  readonly filas?: readonly Record<string, unknown>[];
  /** Lo que Postgres contesta a un `update`. Kysely lo vuelve `numUpdatedRows`. */
  readonly afectadas?: bigint;
}

class ConexionGrabadora implements DatabaseConnection {
  readonly consultas: CompiledQuery[] = [];

  constructor(private readonly respuestas: readonly Respuesta[]) {}

  async executeQuery<R>(consulta: CompiledQuery): Promise<QueryResult<R>> {
    this.consultas.push(consulta);
    const respuesta = this.respuestas[this.consultas.length - 1] ?? {};
    const filas = (respuesta.filas ?? []) as R[];
    // `exactOptionalPropertyTypes` está encendido: poner `numAffectedRows:
    // undefined` no es lo mismo que no ponerlo, y lo segundo es lo que devuelve
    // una consulta que no es un `update`.
    return respuesta.afectadas === undefined
      ? { rows: filas }
      : { rows: filas, numAffectedRows: respuesta.afectadas };
  }

  async *streamQuery<R>(): AsyncIterableIterator<QueryResult<R>> {
    yield { rows: [] };
  }
}

class DriverGrabador implements Driver {
  constructor(private readonly conexion: ConexionGrabadora) {}
  init(): Promise<void> {
    return Promise.resolve();
  }
  async acquireConnection(): Promise<DatabaseConnection> {
    return this.conexion;
  }
  beginTransaction(): Promise<void> {
    return Promise.resolve();
  }
  commitTransaction(): Promise<void> {
    return Promise.resolve();
  }
  rollbackTransaction(): Promise<void> {
    return Promise.resolve();
  }
  releaseConnection(): Promise<void> {
    return Promise.resolve();
  }
  destroy(): Promise<void> {
    return Promise.resolve();
  }
}

function crearTx(respuestas: readonly Respuesta[]): {
  readonly tx: Transaccion;
  readonly conexion: ConexionGrabadora;
} {
  const conexion = new ConexionGrabadora(respuestas);
  const db = new Kysely<Esquema>({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => new DriverGrabador(conexion),
      createIntrospector: (kysely) => new PostgresIntrospector(kysely),
      createQueryCompiler: () => new PostgresQueryCompiler(),
    },
  });
  // El mismo puente de tipos que `stock.test.ts`, y por la misma razón:
  // `Transaccion` es `Transaction<Esquema>`, una clase con miembros privados que
  // ningún objeto estructural puede satisfacer.
  return { tx: db as unknown as Transaccion, conexion };
}

const APERTURA = {
  organizacionId: ORG,
  almacenId: ALMACEN,
  empleadoId: EMPLEADO,
  zonaId: null,
  ahora: AHORA,
} as const;

const CONTEO = {
  insumoId: INSUMO,
  contado: '236.0000',
  unidad: 'pieza',
  capturas: [{ presentacionId: null, cantidad: 236, factor: '1.0000' }],
} as const;

describe('F-106 · abrirToma', () => {
  it('busca la toma abierta por ORGANIZACIÓN y almacén, no sólo por almacén', async () => {
    // Un `almacen_id` es único en todo el sistema, así que buscar sólo por él
    // encontraría hoy la misma fila. El filtro está para que el día que esa
    // consulta cambie —un índice por organización, una partición, un almacén
    // compartido— no haya que acordarse de añadirlo: la fuga entre negocios no
    // se descubre, se hereda.
    const { tx, conexion } = crearTx([{}, { filas: [{ id: TOMA }] }]);

    const id = await abrirToma(tx, APERTURA);

    expect(id).toBe(TOMA);
    const guarda = conexion.consultas[0]!;
    expect(guarda.sql).toMatch(/from "tomas_inventario"/i);
    expect(guarda.sql).toMatch(/"organizacion_id" = \$\d/i);
    expect(guarda.sql).toMatch(/"almacen_id" = \$\d/i);
    expect(guarda.parameters).toEqual([ORG, ALMACEN, 'abierta']);
  });

  it('la fila nueva nace con su organización, su zona y quien la abrió', async () => {
    const { tx, conexion } = crearTx([{}, { filas: [{ id: TOMA }] }]);

    await abrirToma(tx, { ...APERTURA, zonaId: ZONA });

    const insercion = conexion.consultas[1]!;
    expect(insercion.sql).toMatch(/insert into "tomas_inventario"/i);
    // En el orden de `values`. Reordenar el objeto deja esto en verde; quitar
    // una columna, no.
    expect(insercion.parameters).toEqual([ORG, ALMACEN, 'abierta', AHORA, ZONA, EMPLEADO]);
  });

  it('con una toma ya abierta no escribe NADA: lanza antes del insert', async () => {
    // Dos tomas abiertas en el mismo almacén congelan dos «esperados» distintos
    // para el mismo insumo, y la segunda que cierre pisa los ajustes de la
    // primera. Lo que importa aquí no es el error, es que no llegue a insertar.
    const { tx, conexion } = crearTx([{ filas: [{ id: 'otra-toma' }] }]);

    await expect(abrirToma(tx, APERTURA)).rejects.toBeInstanceOf(ErrorDominio);
    expect(conexion.consultas.filter((c) => /insert/i.test(c.sql))).toEqual([]);
  });

  it('el error de toma duplicada es de dominio, no un 23505 de Postgres', async () => {
    // La 061 no tiene unique de «una abierta por almacén»: tiene un índice
    // parcial, que no restringe nada. La guarda es esta consulta y su error, y
    // por eso el código importa aquí y no en la migración.
    const { tx } = crearTx([{ filas: [{ id: 'otra-toma' }] }]);

    await expect(abrirToma(tx, APERTURA)).rejects.toMatchObject({
      codigo: 'INVENTARIO_INVALIDO',
    });
  });
});

describe('F-106 · anotarConteo', () => {
  it('congela el esperado leyendo `existencias` por su llave primaria', async () => {
    const { tx, conexion } = crearTx([{ filas: [{ cantidad: '240.0000' }] }, {}]);

    await anotarConteo(tx, TOMA, ALMACEN, CONTEO, EMPLEADO, AHORA);

    const lectura = conexion.consultas[0]!;
    expect(lectura.sql).toMatch(/from "existencias"/i);
    expect(lectura.parameters).toEqual([ALMACEN, INSUMO]);
    // ── EL HUECO, DICHO EN VOZ ALTA ───────────────────────────────────────
    // Esta consulta NO filtra por organización, y la prueba lo fija en vez de
    // fingir que sí. Es admisible por una razón concreta: `(almacen_id,
    // insumo_id)` es la llave primaria de `existencias` (migración 003), así que
    // añadir el filtro no quitaría ni traería una sola fila. Lo que sostiene el
    // aislamiento es que el `almacenId` que llega aquí SALE de la toma ya leída
    // con su filtro de organización — y eso se vigila abajo, en los llamadores,
    // porque esta función no puede comprobarlo.
    expect(lectura.sql).not.toMatch(/organizacion_id/i);
  });

  it('recapturar el mismo insumo NO deja dos renglones: choca contra el unique', async () => {
    // Sin el `on conflict`, corregir un tecleo escribiría una segunda fila y el
    // faltante de ese insumo se contaría dos veces al cerrar. Lo que impide la
    // segunda fila es el `unique (toma_id, insumo_id)` de la 061; lo que
    // convierte el choque en una corrección en vez de en un 23505 es este
    // `do update`.
    const { tx, conexion } = crearTx([{ filas: [{ cantidad: '240.0000' }] }, {}]);

    await anotarConteo(tx, TOMA, ALMACEN, CONTEO, EMPLEADO, AHORA);

    const insercion = conexion.consultas[1]!;
    expect(insercion.sql).toMatch(/insert into "toma_conteos"/i);
    expect(insercion.sql).toMatch(/on conflict \("toma_id", "insumo_id"\) do update set/i);
  });

  it('el `do update` NO vuelve a sellar el esperado', async () => {
    // Releerlo al recapturar haría que corregir un tecleo a las 14:00 borrara las
    // ventas de entre las 11:00 y las 14:00: la diferencia saldría a cero y el
    // faltante desaparecería del reporte sin que nadie lo decidiera.
    const { tx, conexion } = crearTx([{ filas: [{ cantidad: '240.0000' }] }, {}]);

    await anotarConteo(tx, TOMA, ALMACEN, CONTEO, EMPLEADO, AHORA);

    const sql = conexion.consultas[1]!.sql;
    const actualizacion = sql.slice(sql.toLowerCase().indexOf('do update set'));
    expect(actualizacion).not.toMatch(/"esperado"/i);
    expect(actualizacion).toMatch(/"contado"/i);
    expect(actualizacion).toMatch(/"capturas"/i);
    // El esperado sí va en el `values`: es la PRIMERA captura la que lo congela.
    expect(conexion.consultas[1]!.parameters[2]).toBe('240.0000');
  });

  it('un insumo sin existencia previa se cuenta contra CERO, no contra nada', async () => {
    // Con `null` no habría diferencia que calcular y el renglón desaparecería del
    // cierre. Un insumo que nunca entró y aparece contado ES una diferencia, y de
    // las que importan: significa que entró sin registrarse.
    const { tx, conexion } = crearTx([{}, {}]);

    await anotarConteo(tx, TOMA, ALMACEN, CONTEO, EMPLEADO, AHORA);

    expect(conexion.consultas[1]!.parameters[2]).toBe('0');
  });

  it('guarda las capturas en crudo además del total convertido', async () => {
    // Cuando alguien reclama «yo conté nueve cajas», tiene que poder verse que
    // capturó nueve cajas y que el sistema convirtió. Sin el crudo, toda
    // discusión de conteo acaba en la palabra de uno contra la del sistema.
    const { tx, conexion } = crearTx([{}, {}]);

    await anotarConteo(tx, TOMA, ALMACEN, CONTEO, EMPLEADO, AHORA);

    expect(conexion.consultas[1]!.parameters).toContain(JSON.stringify(CONTEO.capturas));
  });
});

describe('F-106 · diferenciasDeToma', () => {
  it('compara COLUMNA contra columna, no contra un valor traído en memoria', async () => {
    // `contado <> esperado` resuelto en Postgres es lo que hace que la lista no
    // dependa de cuántas filas quepan en memoria. Si la comparación viajara como
    // parámetro, aquí habría dos.
    const { tx, conexion } = crearTx([
      {
        filas: [{ insumo_id: INSUMO, esperado: '240.0000', contado: '236.0000', unidad: 'pieza' }],
      },
    ]);

    const diferencias = await diferenciasDeToma(tx, TOMA);

    expect(diferencias).toEqual([
      { insumoId: INSUMO, esperado: '240.0000', contado: '236.0000', unidad: 'pieza' },
    ]);
    const consulta = conexion.consultas[0]!;
    expect(consulta.sql).toMatch(/"contado" <> "esperado"/i);
    expect(consulta.parameters).toEqual([TOMA]);
  });

  it('acota por `toma_id` y por nada más: la organización la pone el llamador', async () => {
    // `toma_conteos` NO tiene columna de organización (061): cuelga de
    // `tomas_inventario`. Aquí no hay filtro que poner, y la única defensa es que
    // el `tomaId` venga de una toma ya leída con el suyo.
    const { tx, conexion } = crearTx([{}]);

    await diferenciasDeToma(tx, TOMA);

    expect(conexion.consultas[0]!.sql).not.toMatch(/organizacion_id/i);
  });
});

describe('F-106 · cerrarToma', () => {
  it('cierra filtrando por organización, por id y por estado abierto', async () => {
    const { tx, conexion } = crearTx([{ afectadas: 1n }]);

    const cerradas = await cerrarToma(tx, ORG, TOMA, AHORA);

    expect(cerradas).toBe(1);
    const consulta = conexion.consultas[0]!;
    expect(consulta.sql).toMatch(/update "tomas_inventario"/i);
    expect(consulta.sql).toMatch(/"organizacion_id" = \$\d/i);
    expect(consulta.parameters).toEqual(['cerrada', AHORA, ORG, TOMA, 'abierta']);
  });

  it('escribe `estado` y `cerrada_en` en el MISMO set', async () => {
    // `toma_cerrada_con_fecha` rechaza con 23514 una toma cerrada sin fecha. Es
    // la familia de defectos que ya tumbó todos los cobros del sistema una vez:
    // `estados-con-columna` la vigila para todo el esquema leyendo el código, y
    // aquí se mira en el SQL que de verdad sale.
    const { tx, conexion } = crearTx([{ afectadas: 1n }]);

    await cerrarToma(tx, ORG, TOMA, AHORA);

    const sql = conexion.consultas[0]!.sql.toLowerCase();
    const asignaciones = sql.slice(sql.indexOf(' set '), sql.indexOf(' where '));
    expect(asignaciones).toMatch(/"estado"/);
    expect(asignaciones).toMatch(/"cerrada_en"/);
  });

  it('CERRAR UNA TOMA YA CERRADA es un no-op silencioso que devuelve 0', async () => {
    // Esto es lo que nadie tenía escrito y aquí queda fijado: NO lanza. El
    // `where estado = 'abierta'` hace que el update no toque ninguna fila y la
    // función devuelve 0 sin decir nada. Es deliberado —decidir la política sería
    // del comando, no del repositorio— pero convierte el número devuelto en la
    // ÚNICA señal de que el cierre no ocurrió.
    const { tx, conexion } = crearTx([{ afectadas: 0n }]);

    const cerradas = await cerrarToma(tx, ORG, TOMA, AHORA);

    expect(cerradas).toBe(0);
    expect(conexion.consultas).toHaveLength(1);
  });

  it('una toma de otra organización se ve exactamente igual que una ya cerrada: 0', async () => {
    // Postgres no distingue «no existe» de «no es tuya» ni de «ya estaba
    // cerrada»: las tres son cero filas. Por eso el llamador tiene que tratar el
    // 0 como fallo y nunca como «ya estaba hecho».
    const { tx } = crearTx([{ afectadas: 0n }]);

    expect(await cerrarToma(tx, ORG, TOMA, AHORA)).toBe(0);
  });
});

// ── Lo que ninguna base en memoria puede ver: el esquema y los llamadores ──

function sinComentariosSql(texto: string): string {
  return texto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*--.*$/gm, '');
}

function sinComentariosTs(texto: string): string {
  return texto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function archivosDeMigracion(): string[] {
  return readdirSync(MIGRACIONES)
    .filter((e) => e.endsWith('.sql'))
    .sort();
}

function sqlDe(archivo: string): string {
  return sinComentariosSql(readFileSync(join(MIGRACIONES, archivo), 'utf8'));
}

/**
 * El cuerpo de un `(` … `)` contando paréntesis, desde `desde`.
 *
 * Cortar en el primer `)` es el error que ya costó cuatro intentos en los otros
 * contratos de esta carpeta: un `check` con un `or (a and b)` dentro trae los
 * suyos y el recorte se queda a medias, con una lista que parece cerrada y es un
 * trozo de otra cosa.
 */
function cuerpoBalanceado(sql: string, desde: number): string | null {
  const abre = sql.indexOf('(', desde);
  if (abre === -1) return null;
  let profundidad = 0;
  for (let i = abre; i < sql.length; i += 1) {
    const c = sql[i];
    if (c === '(') profundidad += 1;
    else if (c === ')') {
      profundidad -= 1;
      if (profundidad === 0) return sql.slice(abre + 1, i);
    }
  }
  return null;
}

/**
 * Los valores de un `check` VIGENTE, leyendo las migraciones en orden de número.
 *
 * El orden importa, y el `drop` también: un `check` no se amplía, se tira y se
 * vuelve a escribir entero. Leer sólo la 061 daría por buena una lista que una
 * migración posterior pudo haber cambiado.
 */
function valoresDelCheckVigente(nombre: string): ReadonlySet<string> | null {
  let vigente: ReadonlySet<string> | null = null;

  for (const archivo of archivosDeMigracion()) {
    for (const sentencia of sqlDe(archivo).split(';')) {
      const tirado = new RegExp(`drop\\s+constraint\\s+(?:if\\s+exists\\s+)?"?${nombre}"?`, 'i');
      if (tirado.test(sentencia)) vigente = null;

      const declara = new RegExp(`constraint\\s+"?${nombre}"?\\s+check`, 'i').exec(sentencia);
      if (declara === null) continue;
      const cuerpo = cuerpoBalanceado(sentencia, declara.index + declara[0].length);
      if (cuerpo === null) continue;
      vigente = new Set([...cuerpo.matchAll(/'([^']*)'/g)].map((m) => m[1] ?? ''));
    }
  }

  return vigente;
}

/** Los estados que el repositorio escribe o consulta, como LITERALES. */
function estadosDelRepositorio(): ReadonlySet<string> {
  const fuente = sinComentariosTs(readFileSync(FUENTE, 'utf8'));
  const encontrados = new Set<string>();
  for (const m of fuente.matchAll(/estado:\s*'([^']*)'/g)) encontrados.add(m[1] ?? '');
  for (const m of fuente.matchAll(/'estado',\s*'=',\s*'([^']*)'/g)) encontrados.add(m[1] ?? '');
  return encontrados;
}

function archivosTs(raiz: string): string[] {
  const salida: string[] = [];
  for (const entrada of readdirSync(raiz)) {
    const ruta = join(raiz, entrada);
    if (statSync(ruta).isDirectory()) {
      if (entrada === 'pruebas' || entrada === 'node_modules') continue;
      salida.push(...archivosTs(ruta));
    } else if (entrada.endsWith('.ts') && !entrada.includes('.test.')) {
      salida.push(ruta);
    }
  }
  return salida;
}

interface Llamador {
  readonly ruta: string;
  readonly codigo: string;
}

/** Los archivos de comandos que llaman a una función de este repositorio. */
function llamadoresDe(funcion: string): Llamador[] {
  return archivosTs(CODIGO_DE_COMANDOS)
    .map((ruta) => ({
      ruta: ruta.slice(ruta.indexOf('packages')),
      codigo: sinComentariosTs(readFileSync(ruta, 'utf8')),
    }))
    .filter((archivo) => new RegExp(`\\b${funcion}\\s*\\(`).test(archivo.codigo));
}

/** La lectura de la toma acotada por organización, dentro del mismo archivo. */
const LEE_LA_TOMA_ACOTADA =
  /selectFrom\('tomas_inventario'\)[\s\S]{0,400}?where\('organizacion_id', '=',/;

describe('F-106 · lo que sólo se ve leyendo el esquema', () => {
  it('los estados que el repositorio escribe Y consulta caben en el check vigente', () => {
    // El contrato `valores-de-check` ya vigila los literales de `.values({…})` y
    // `.set({…})`. Lo que NO mira es el `.where('estado', '=', 'abierta')`, y ése
    // es el peor de los tres: un estado mal tecleado en un `where` no revienta
    // con 23514 — no casa con ninguna fila, el cierre devuelve 0 en silencio y
    // parece que la toma «ya estaba cerrada».
    const admitidos = valoresDelCheckVigente('tomas_inventario_estado_valido');
    expect(admitidos).not.toBeNull();

    const escritos = estadosDelRepositorio();
    // Sin esto la prueba pasaría vacía el día que el patrón deje de encajar, y
    // afirmaría en su nombre algo que ya no mira.
    expect([...escritos].sort()).toEqual(['abierta', 'cerrada']);

    const fuera = [...escritos].filter((estado) => !(admitidos?.has(estado) ?? false));
    expect(fuera).toEqual([]);
  });

  it('el `on conflict (toma_id, insumo_id)` se apoya en un unique que la migración declara', () => {
    // Un `on conflict` sobre columnas SIN índice único no es un choque resuelto:
    // es un 42P10 en la primera recaptura. La base falsa de los comandos honra el
    // `on conflict` exista o no el unique, así que ésta es la única puerta que
    // puede verlo.
    const conLaTabla = archivosDeMigracion()
      .map(sqlDe)
      .filter((sql) => /create\s+table\s+toma_conteos/i.test(sql));
    expect(conLaTabla).toHaveLength(1);
    expect(conLaTabla[0]!).toMatch(/unique\s*\(\s*toma_id\s*,\s*insumo_id\s*\)/i);

    const tirados = archivosDeMigracion().filter((archivo) =>
      /drop\s+(?:constraint|index)[^;]*toma_conteos/i.test(sqlDe(archivo)),
    );
    expect(tirados).toEqual([]);
  });
});

describe('F-106 · el filtro de organización que estas funciones NO tienen', () => {
  it('todo el que anota un conteo lee antes la toma acotada por organización', () => {
    // `anotarConteo` recibe `tomaId` y `almacenId` y no puede comprobar de quién
    // son: `toma_conteos` no tiene columna de organización. La defensa vive en el
    // llamador, y un llamador nuevo que se la salte escribe conteos en la toma de
    // otro negocio sin que nada se queje. Es un cerco de texto —mira el archivo,
    // no el flujo— y es la única puerta que hay hoy entre este repositorio y esa
    // fuga.
    const llamadores = llamadoresDe('anotarConteo');
    expect(llamadores.length).toBeGreaterThanOrEqual(2);

    const sinFiltro = llamadores
      .filter((archivo) => !LEE_LA_TOMA_ACOTADA.test(archivo.codigo))
      .map((a) => `${a.ruta} anota un conteo sin leer antes la toma por organizacion_id`);

    expect(sinFiltro).toEqual([]);
  });

  it('todo el que pide las diferencias lee antes la toma acotada por organización', () => {
    const llamadores = llamadoresDe('diferenciasDeToma');
    expect(llamadores.length).toBeGreaterThanOrEqual(1);

    const sinFiltro = llamadores
      .filter((archivo) => !LEE_LA_TOMA_ACOTADA.test(archivo.codigo))
      .map((a) => `${a.ruta} pide diferencias de una toma que no acotó por organizacion_id`);

    expect(sinFiltro).toEqual([]);
  });

  it('todo el que cierra una toma comprueba que se cerró UNA fila', () => {
    // El no-op silencioso de `cerrarToma` sólo es seguro mientras alguien mire el
    // conteo. Sin esa comprobación, los ajustes de stock quedan escritos y la
    // toma abierta: el siguiente cierre los vuelve a escribir y el kardex cuenta
    // dos veces la misma diferencia.
    const llamadores = llamadoresDe('cerrarToma');
    expect(llamadores.length).toBeGreaterThanOrEqual(1);

    const sinComprobar = llamadores
      .filter((archivo) => !/cerrarToma\([\s\S]{0,400}?!== 1/.test(archivo.codigo))
      .map((a) => `${a.ruta} cierra la toma y no comprueba que se cerró exactamente una fila`);

    expect(sinComprobar).toEqual([]);
  });
});
