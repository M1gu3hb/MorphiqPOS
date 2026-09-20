import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { esErrorDominio } from '@morphiqpos/contracts';
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
import { enviarTraspaso, recibirTraspaso } from './traspasos.ts';

/**
 * F-105 · EL CONTRATO DEL REPOSITORIO, no el de sus comandos.
 *
 * ── Qué faltaba ────────────────────────────────────────────────────────────
 * `repos/traspasos.ts` se ejercita hoy desde los trece casos de
 * `app/src/inventario/traspaso.test.ts`, a través de los dos comandos. Eso
 * prueba los comandos. Lo que nadie afirmaba es lo que este archivo promete por
 * sí mismo, y la diferencia importa porque el comando ya trae sus propias
 * guardas: `recibirTraspaso` de arriba carga el traspaso con
 * `where organizacion_id` ANTES de llamar aquí, así que el cerco del
 * repositorio está hoy duplicado. Un cerco duplicado es un cerco que alguien
 * puede quitar creyendo que el otro lo cubre — y el día que un segundo comando
 * llame a este repositorio sin esa lectura previa, el que queda es éste.
 *
 * ── Por qué se compila SQL de verdad y no se usa la base falsa ─────────────
 * Porque las tres cosas que hay que afirmar aquí son invisibles para un doble
 * en memoria: la base falsa acepta cualquier nombre de columna, no lleva
 * `check` y no distingue una consulta con filtro de una sin él —sólo enseña el
 * efecto—. Se usa el mismo aparato que `stock.test.ts`: un `Driver` que graba
 * la consulta YA COMPILADA. Sobre ese texto sí se puede afirmar qué columnas
 * escribe, con qué las ancla y con qué parámetros.
 *
 * ── Lo que esta prueba NO puede ver, dicho antes de que parezca que sí ─────
 * No hay Postgres: nadie aplica los `check`, nadie revierte nada. Cuando aquí
 * se dice «el rollback lo deshace», eso es una afirmación sobre la transacción
 * que envuelve al repositorio, y ésa es de las pruebas de integración. Aquí se
 * afirma la mitad que sí depende de este código: que LANZA, que es lo que
 * obliga a ese rollback.
 */

const AQUI = dirname(fileURLToPath(import.meta.url));
const MIGRACIONES = join(AQUI, '../migraciones/sql');
const ARCHIVO_061 = join(MIGRACIONES, '061_traspasos_y_toma_fisica.sql');

const ORG = '10000000-0000-0000-0000-000000000001';
const OTRA_ORG = '10000000-0000-0000-0000-000000000009';
const ALMACEN_ORIGEN = '20000000-0000-0000-0000-000000000001';
const ALMACEN_DESTINO = '20000000-0000-0000-0000-000000000002';
const INSUMO_A = '30000000-0000-0000-0000-00000000000a';
const INSUMO_B = '30000000-0000-0000-0000-00000000000b';
const TRASPASO = '40000000-0000-0000-0000-000000000001';
const EMPLEADO = '50000000-0000-0000-0000-000000000001';
const AHORA = new Date('2026-09-16T14:00:00.000Z');

// ── El doble de conexión ────────────────────────────────────────────────────

/**
 * Lo que la base contesta, declarado por FORMA de sentencia y no por posición.
 *
 * `stock.test.ts` guioniza por posición y allí funciona porque el orden es el
 * contrato. Aquí no: lo que se afirma es el contenido de cada sentencia, y una
 * lista posicional obligaría a recontar respuestas cada vez que una prueba
 * cambia el número de renglones recibidos. Lo que de verdad hay que poder
 * decidir es sólo esto: qué id devuelve la cabecera al nacer, cuántas filas
 * dice la base que tocó la guarda, y qué líneas salen con diferencia.
 */
interface Guion {
  readonly idCreado?: string;
  /** Lo que contesta el `update` de la cabecera. Cero = la guarda no encontró. */
  readonly filasTocadas?: bigint;
  readonly conDiferencia?: readonly string[];
}

class ConexionGrabadora implements DatabaseConnection {
  readonly consultas: CompiledQuery[] = [];

  constructor(private readonly guion: Guion) {}

  async executeQuery<R>(consulta: CompiledQuery): Promise<QueryResult<R>> {
    this.consultas.push(consulta);
    const sql = consulta.sql.toLowerCase();

    if (sql.startsWith('insert into "traspasos"')) {
      return { rows: [{ id: this.guion.idCreado ?? TRASPASO }] as R[] };
    }
    if (sql.startsWith('update "traspasos"')) {
      return { rows: [], numAffectedRows: this.guion.filasTocadas ?? 1n };
    }
    if (sql.startsWith('select')) {
      return { rows: (this.guion.conDiferencia ?? []).map((id) => ({ insumo_id: id })) as R[] };
    }
    return { rows: [], numAffectedRows: 1n };
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

function crearTx(guion: Guion = {}): {
  readonly tx: Transaccion;
  readonly conexion: ConexionGrabadora;
} {
  const conexion = new ConexionGrabadora(guion);
  const db = new Kysely<Esquema>({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => new DriverGrabador(conexion),
      createIntrospector: (kysely) => new PostgresIntrospector(kysely),
      createQueryCompiler: () => new PostgresQueryCompiler(),
    },
  });
  return { tx: db as unknown as Transaccion, conexion };
}

// ── Lo que la migración declara ─────────────────────────────────────────────

/** El cuerpo de un `create table`, contando paréntesis. */
function cuerpoDeTabla(sql: string, tabla: string): string {
  const cabeza = new RegExp(
    `create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?"?${tabla}"?\\s*\\(`,
    'i',
  );
  const inicio = cabeza.exec(sql);
  if (inicio === null) return '';
  const abre = inicio.index + inicio[0].length - 1;
  let profundidad = 0;
  for (let i = abre; i < sql.length; i += 1) {
    if (sql[i] === '(') profundidad += 1;
    else if (sql[i] === ')') {
      profundidad -= 1;
      if (profundidad === 0) return sql.slice(abre + 1, i);
    }
  }
  return '';
}

/** Los fragmentos de una definición de tabla, cortando por las comas de nivel cero. */
function fragmentos(cuerpo: string): string[] {
  const partes: string[] = [];
  let profundidad = 0;
  let desde = 0;
  for (let i = 0; i < cuerpo.length; i += 1) {
    const c = cuerpo[i];
    if (c === '(') profundidad += 1;
    else if (c === ')') profundidad -= 1;
    else if (c === ',' && profundidad === 0) {
      partes.push(cuerpo.slice(desde, i));
      desde = i + 1;
    }
  }
  partes.push(cuerpo.slice(desde));
  return partes.map((p) => p.trim()).filter((p) => p.length > 0);
}

const NO_ES_COLUMNA = /^(constraint|unique|primary\s+key|foreign\s+key|check|exclude|like)\b/i;

function sinComentarios(texto: string): string {
  return texto.replace(/^\s*--.*$/gm, '');
}

const SQL_061 = sinComentarios(readFileSync(ARCHIVO_061, 'utf8'));

function columnasDeclaradas(tabla: string): ReadonlySet<string> {
  const columnas = new Set<string>();
  for (const fragmento of fragmentos(cuerpoDeTabla(SQL_061, tabla))) {
    if (NO_ES_COLUMNA.test(fragmento)) continue;
    const nombre = /^"?(\w+)"?\s/.exec(fragmento)?.[1];
    if (nombre !== undefined) columnas.add(nombre);
  }
  return columnas;
}

/** Los valores del `check (estado in (…))` de una tabla. */
function estadosAdmitidos(tabla: string): ReadonlySet<string> {
  const fragmento = fragmentos(cuerpoDeTabla(SQL_061, tabla)).find((f) =>
    /\bestado\s+in\s*\(/i.test(f),
  );
  const lista =
    fragmento === undefined ? '' : (/\bestado\s+in\s*\(([^)]*)\)/i.exec(fragmento)?.[1] ?? '');
  return new Set([...lista.matchAll(/'([^']*)'/g)].map((m) => m[1] ?? ''));
}

const COLUMNAS: Readonly<Record<string, ReadonlySet<string>>> = {
  traspasos: columnasDeclaradas('traspasos'),
  traspaso_lineas: columnasDeclaradas('traspaso_lineas'),
};
const ESTADOS = estadosAdmitidos('traspasos');

// ── Lo que la sentencia compilada dice ──────────────────────────────────────

/** La tabla que una sentencia compilada toca. */
function objetivo(sql: string): string {
  return (
    /insert\s+into\s+"(\w+)"/i.exec(sql)?.[1] ??
    /update\s+"(\w+)"/i.exec(sql)?.[1] ??
    /from\s+"(\w+)"/i.exec(sql)?.[1] ??
    ''
  );
}

/**
 * Los identificadores que la sentencia nombra, sin la tabla.
 *
 * El compilador de Postgres entrecomilla TODO identificador, así que esto es la
 * lista de columnas que la consulta usa de verdad — la que Postgres resolvería
 * contra el catálogo y contra la que devolvería un 42703 si sobrara una.
 */
function columnasQueNombra(sql: string): string[] {
  const tabla = objetivo(sql);
  return [...sql.matchAll(/"(\w+)"/g)].map((m) => m[1] ?? '').filter((n) => n !== tabla);
}

/**
 * El valor que la sentencia pone o exige en `estado`, leído por POSICIÓN.
 *
 * Buscar cadenas sueltas entre los parámetros no serviría: un `motivo` de texto
 * libre se confundiría con un estado y el contrato señalaría como defecto un
 * código correcto. Se localiza el `$n` que le corresponde a la columna `estado`
 * —en el `set`/`where` de un `update`, o por su posición en la lista de un
 * `insert`— y se lee ESE parámetro.
 */
function estadosQueUsa(consulta: CompiledQuery): string[] {
  const { sql, parameters } = consulta;
  const indices: number[] = [];

  for (const m of sql.matchAll(/"estado"\s*=\s*\$(\d+)/g)) {
    indices.push(Number(m[1]) - 1);
  }

  const inserta = /insert\s+into\s+"\w+"\s*\(([^)]*)\)\s*values\s*\(([^)]*)\)/i.exec(sql);
  if (inserta !== null) {
    const columnas = (inserta[1] ?? '').split(',').map((c) => c.trim().replaceAll('"', ''));
    const valores = (inserta[2] ?? '').split(',').map((v) => v.trim());
    const donde = columnas.indexOf('estado');
    const parametro = donde === -1 ? undefined : /\$(\d+)/.exec(valores[donde] ?? '')?.[1];
    if (parametro !== undefined) indices.push(Number(parametro) - 1);
  }

  return indices.map((i) => parameters[i]).filter((v): v is string => typeof v === 'string');
}

// ── Los dos recorridos felices, que son de donde salen las sentencias ───────

const LINEAS = [
  { insumoId: INSUMO_A, cantidad: '3.5000', unidad: 'kg' },
  { insumoId: INSUMO_B, cantidad: '2.0000', unidad: 'pieza' },
];

async function alEnviar(guion: Guion = {}): Promise<ConexionGrabadora> {
  const { tx, conexion } = crearTx(guion);
  await enviarTraspaso(tx, {
    organizacionId: ORG,
    almacenOrigen: ALMACEN_ORIGEN,
    almacenDestino: ALMACEN_DESTINO,
    empleadoId: EMPLEADO,
    motivo: 'Falta producto en la sucursal chica',
    lineas: LINEAS,
    ahora: AHORA,
  });
  return conexion;
}

async function alRecibir(
  guion: Guion = {},
  recibido: readonly { readonly insumoId: string; readonly cantidad: string }[] = [
    { insumoId: INSUMO_A, cantidad: '3.5000' },
  ],
): Promise<ConexionGrabadora> {
  const { tx, conexion } = crearTx(guion);
  await recibirTraspaso(tx, {
    organizacionId: ORG,
    traspasoId: TRASPASO,
    empleadoId: EMPLEADO,
    recibido,
    ahora: AHORA,
  });
  return conexion;
}

// ── 1 · El cerco multi-inquilino ────────────────────────────────────────────

describe('F-105 · ninguna sentencia del repositorio queda suelta', () => {
  it('cada sentencia va anclada, y con el VALOR del ancla, no sólo con su nombre', async () => {
    // EL PUNTO DEL ARCHIVO ENTERO. Un repositorio multi-inquilino que se olvida
    // el filtro en UNA función es una fuga entre negocios, y la regla se deriva
    // de la migración en vez de escribirse a mano: si la tabla conoce su
    // organización, la sentencia tiene que nombrarla; si no la conoce
    // —`traspaso_lineas` no tiene `organizacion_id`—, la pertenencia la hereda
    // de la cabecera y entonces el ancla es `traspaso_id`. Comprobar sólo que
    // el nombre aparezca dejaría pasar un `organizacion_id = $3` apuntando al
    // parámetro equivocado, así que se comprueba también el valor.
    const sentencias = [
      ...(await alEnviar()).consultas,
      ...(await alRecibir({}, [{ insumoId: INSUMO_A, cantidad: '1' }])).consultas,
    ];

    expect(sentencias.length).toBeGreaterThanOrEqual(5);

    for (const consulta of sentencias) {
      const tabla = objetivo(consulta.sql);
      expect(Object.keys(COLUMNAS)).toContain(tabla);

      if (COLUMNAS[tabla]?.has('organizacion_id') === true) {
        expect(consulta.sql, `${consulta.sql}: toca ${tabla} sin nombrar la organización.`).toMatch(
          /"organizacion_id"/,
        );
        expect(
          consulta.parameters,
          `${consulta.sql}: nombra la organización y no la usa.`,
        ).toContain(ORG);
        continue;
      }

      // `traspaso_lineas` cuelga de la cabecera y de nada más. OJO: esto NO es
      // un filtro de inquilino, y por eso va dicho aquí: un `traspasoId` ajeno
      // llega igual a sus líneas. Lo único que impide que esa escritura quede
      // es que `recibirTraspaso` LANCE y la transacción revierta — el contrato
      // de más abajo, que por esto no es cosmético.
      expect(consulta.sql, `${consulta.sql}: toca ${tabla} sin anclarlo al traspaso.`).toMatch(
        /"traspaso_id"/,
      );
      expect(consulta.parameters).toContain(TRASPASO);
    }
  });

  it('recibir exige la organización Y el estado en la MISMA guarda', async () => {
    const conexion = await alRecibir();
    const cabecera = conexion.consultas.find((c) => c.sql.startsWith('update "traspasos"'));

    // Las dos en el mismo `where` a propósito: separar la comprobación de
    // pertenencia de la de estado abre la ventana entre leer y escribir, que es
    // por donde se recibe dos veces el mismo traspaso.
    expect(cabecera?.sql).toMatch(/"organizacion_id"\s*=\s*\$\d+/);
    expect(cabecera?.sql).toMatch(/"estado"\s*=\s*\$\d+/);
    expect(cabecera?.parameters).toContain(ORG);
    expect(cabecera?.parameters).toContain(TRASPASO);
  });

  it('enviar no valida nada: estampa la organización que le dan y ya', async () => {
    const conexion = await alEnviar();

    // La división de trabajo, escrita como afirmación y no como comentario: el
    // repositorio no consulta `almacenes` ni `insumos`, así que NO comprueba
    // que los dos almacenes sean de esta organización. Eso lo hace
    // `comprobarAlmacenes` en el comando. Un segundo llamador que se lo salte
    // creará una cabecera con ESTA organización sobre almacenes ajenos, y
    // ninguna de las dos mitades se quejará.
    expect(conexion.consultas).toHaveLength(2);
    expect(conexion.consultas.map((c) => objetivo(c.sql))).toEqual([
      'traspasos',
      'traspaso_lineas',
    ]);
  });

  it('las líneas cuelgan del id que DEVOLVIÓ la cabecera, no de otro', async () => {
    const otroId = '40000000-0000-0000-0000-0000000000ff';
    const conexion = await alEnviar({ idCreado: otroId });
    const lineas = conexion.consultas[1];

    // Una línea colgada de un id que no es el de su cabecera es producto que se
    // movió para nadie: el `returning` y el `values` de después tienen que ser
    // el mismo traspaso.
    expect(lineas?.parameters).toContain(otroId);
    expect(lineas?.parameters).toContain(INSUMO_A);
    expect(lineas?.parameters).toContain(INSUMO_B);
  });
});

// ── 2 · Las columnas y los estados que la migración declara ─────────────────

describe('F-105 · el repositorio y la 061 hablan del mismo esquema', () => {
  it('la migración se deja leer: si no, este contrato pasaría vacío', () => {
    // Sin esto, el día que el patrón deje de encajar —una tabla movida de
    // archivo, un `create table` escrito de otra forma— los dos casos de abajo
    // seguirían en verde comparando contra conjuntos vacíos.
    expect(COLUMNAS['traspasos']?.size ?? 0).toBeGreaterThanOrEqual(10);
    expect(COLUMNAS['traspaso_lineas']?.size ?? 0).toBeGreaterThanOrEqual(6);
    expect(ESTADOS.size).toBeGreaterThanOrEqual(3);
  });

  it('ninguna migración posterior altera estas dos tablas', () => {
    // La 061 es hoy la única palabra sobre estas tablas, y todo lo de arriba lo
    // da por hecho. El día que llegue un `alter table traspasos add column`,
    // este caso se cae y obliga a que el contrato lea también esa migración —en
    // vez de seguir comparando contra un esquema que ya no es el vigente, que
    // es como un contrato empieza a mentir sin que nadie lo toque.
    const alteran = readdirSync(MIGRACIONES)
      .filter((e) => e.endsWith('.sql') && e !== '061_traspasos_y_toma_fisica.sql')
      .filter((e) =>
        /alter\s+table\s+(?:only\s+)?"?traspasos?"?\b|alter\s+table\s+(?:only\s+)?"?traspaso_lineas"?\b/i.test(
          sinComentarios(readFileSync(join(MIGRACIONES, e), 'utf8')),
        ),
      );

    expect(alteran).toEqual([]);
  });

  it('toda columna que escribe o filtra existe en la tabla que dice tocar', async () => {
    // Contra Postgres, una columna que no existe es un 42703 en la primera
    // recepción. La base falsa de las otras pruebas no lo ve: acepta cualquier
    // nombre, lo guarda y lo devuelve tal cual, así que un `recepcion_en` por
    // `recibido_en` pasaría sus trece casos en verde.
    const sentencias = [
      ...(await alEnviar()).consultas,
      ...(await alRecibir({}, [{ insumoId: INSUMO_A, cantidad: '1' }])).consultas,
    ];

    const intrusas = sentencias.flatMap((c) => {
      const tabla = objetivo(c.sql);
      const declaradas = COLUMNAS[tabla];
      return columnasQueNombra(c.sql)
        .filter((columna) => declaradas?.has(columna) !== true)
        .map((columna) => `${tabla}.${columna}`);
    });

    expect([...new Set(intrusas)]).toEqual([]);
  });

  it('el estado que escribe Y el que exige en la guarda caben los dos en el check', async () => {
    const sentencias = [
      ...(await alEnviar()).consultas,
      ...(await alRecibir({}, [{ insumoId: INSUMO_A, cantidad: '1' }])).consultas,
    ];
    const usados = sentencias.flatMap(estadosQueUsa);

    // `enviado` aparece dos veces por razones distintas y las dos cuentan: se
    // ESCRIBE al crear y se EXIGE al recibir. Un valor que el check no admite
    // es un 23514 cuando se escribe; y cuando se LEE es peor, porque no revienta
    // nada: la guarda deja de encontrar filas, `recibirTraspaso` lanza siempre y
    // no hay traspaso que se pueda recibir jamás. Ningún doble en memoria lo ve,
    // porque ningún doble en memoria lleva `check`.
    expect(usados).toContain('enviado');
    expect(usados).toContain('recibido');
    for (const estado of usados) {
      expect([...ESTADOS], `el repositorio usa «${estado}», que el check no admite.`).toContain(
        estado,
      );
    }
  });

  it('recibir no reescribe `enviado_en`: esa columna dice cuándo SALIÓ', async () => {
    const conexion = await alRecibir();
    const cabecera = conexion.consultas.find((c) => c.sql.startsWith('update "traspasos"'));
    const set = /set\s+(.*?)\s+where/is.exec(cabecera?.sql ?? '')?.[1] ?? '';

    // `traspaso_recibido_completo` exige `enviado_en` Y `recibido_en`, y la
    // tentación de escribir las dos aquí es exactamente el defecto que el
    // contrato `estados-con-columna` declara como excepción con nombre:
    // `enviado_en` la puso el envío, horas antes, y reescribirla al recibir
    // sustituiría la hora real de salida por la de llegada. El `check` se cumple
    // porque la fila YA la trae, no porque este `set` la ponga.
    expect(set).toContain('"recibido_en"');
    expect(set).not.toContain('"enviado_en"');

    // Y tampoco toca `empleado_id`: esa columna guarda quién ENVIÓ. Pisarla al
    // recibir borraría el único rastro de quién sacó el producto. El precio es
    // que quién lo recibió no queda escrito en ningún sitio —`empleadoId` llega
    // en `RecepcionDeTraspaso` y este repositorio lo ignora—, y eso es un hueco
    // del esquema, no de esta prueba: la 061 no tiene columna donde ponerlo.
    expect(set).not.toContain('"empleado_id"');
  });
});

// ── 3 · Qué contesta cuando no encuentra nada ───────────────────────────────

describe('F-105 · lo que devuelve cuando no hay nada que devolver', () => {
  it('recibir un traspaso que la guarda no encuentra LANZA, no devuelve cero', async () => {
    const { tx, conexion } = crearTx({ filasTocadas: 0n });

    const fallo = await recibirTraspaso(tx, {
      organizacionId: OTRA_ORG,
      traspasoId: TRASPASO,
      empleadoId: EMPLEADO,
      recibido: [{ insumoId: INSUMO_A, cantidad: '1' }],
      ahora: AHORA,
    }).catch((e: unknown) => e);

    // La distinción que decide si el comando de arriba falla abierto o cerrado.
    // Devolver `{ filas: 0, diferencias: [] }` sería lo peor posible: el
    // llamador lo leería como «recibido y sin diferencias», sumaría el stock de
    // entrada y daría por cerrado un traspaso que sigue en tránsito — o que es
    // de otro negocio. Lanzar es además lo que obliga a revertir la escritura
    // que las líneas YA recibieron unas sentencias antes.
    expect(esErrorDominio(fallo)).toBe(true);
    expect(fallo).toMatchObject({ codigo: 'INVENTARIO_INVALIDO' });

    // Y no llega al `select` de diferencias. Si llegara, devolvería los insumos
    // de un traspaso que no es de esta organización: la fuga entera, en el valor
    // de retorno.
    expect(conexion.consultas.filter((c) => c.sql.startsWith('select'))).toHaveLength(0);
  });

  it('sin diferencias devuelve un arreglo VACÍO, y un renglón sin contar SÍ es diferencia', async () => {
    const { tx, conexion } = crearTx({ conDiferencia: [] });

    const salida = await recibirTraspaso(tx, {
      organizacionId: ORG,
      traspasoId: TRASPASO,
      empleadoId: EMPLEADO,
      recibido: [{ insumoId: INSUMO_A, cantidad: '3.5000' }],
      ahora: AHORA,
    });

    // `[]` significa «llegó todo lo que salió», y sólo significa eso porque
    // `enviarTraspaso` rechaza un traspaso sin líneas: si una cabecera pudiera
    // existir sin renglones, este mismo `[]` significaría «no había nada que
    // comparar» y las dos cosas serían indistinguibles para el llamador. Por eso
    // el caso de más abajo —cero líneas se rechaza— sostiene a éste.
    expect(salida.diferencias).toEqual([]);
    expect(salida.filas).toBe(1);

    // Y las DOS ramas del `or`, que es donde `[]` se gana el significado. Una
    // línea que nadie contó tiene `cantidad_recibida` nula, y en Postgres
    // `null <> '10'` no es falso: es NULO, o sea que no entra en el resultado.
    // Quedarse sólo con la comparación —que parece la simplificación obvia—
    // haría que el renglón que NADIE tocó saliera como cuadrado, que es el
    // faltante disfrazado de traspaso correcto.
    const seleccion = conexion.consultas.find((c) => c.sql.startsWith('select'));
    expect(seleccion?.sql).toMatch(/"cantidad_recibida"\s+is\s+null/);
    expect(seleccion?.sql).toMatch(/"cantidad_recibida"\s*<>\s*"cantidad"/);
  });

  it('enviar sin líneas o contra el mismo almacén no toca la base', async () => {
    const { tx, conexion } = crearTx();
    const base = {
      organizacionId: ORG,
      empleadoId: EMPLEADO,
      motivo: null,
      ahora: AHORA,
    };

    const sinLineas = await enviarTraspaso(tx, {
      ...base,
      almacenOrigen: ALMACEN_ORIGEN,
      almacenDestino: ALMACEN_DESTINO,
      lineas: [],
    }).catch((e: unknown) => e);

    const aSiMismo = await enviarTraspaso(tx, {
      ...base,
      almacenOrigen: ALMACEN_ORIGEN,
      almacenDestino: ALMACEN_ORIGEN,
      lineas: LINEAS,
    }).catch((e: unknown) => e);

    expect(esErrorDominio(sinLineas)).toBe(true);
    expect(esErrorDominio(aSiMismo)).toBe(true);
    // Cero sentencias: los dos rechazos ocurren ANTES de escribir la cabecera.
    // Si ocurrieran después, quedaría una cabecera sin líneas —un traspaso que
    // no traspasa nada y que el `select` de diferencias daría por cuadrado— o
    // una cabecera que el `check traspasos_almacenes_distintos` rechaza con
    // 23514 a mitad de la transacción.
    expect(conexion.consultas).toHaveLength(0);
  });

  it('recibir SIN renglones cierra el traspaso igual: el repositorio no lo impide', async () => {
    const conexion = await alRecibir({ conDiferencia: [INSUMO_A, INSUMO_B] }, []);

    // No es un descuido que se deje pasar: es dónde vive la guarda. El comando
    // `inventario.recibir_traspaso` la pone con un `min(1)` de Zod, y aquí no
    // hay ninguna — así que un segundo llamador puede marcar como recibido un
    // traspaso del que no recibió ni un renglón. Queda escrito para que quien
    // llame sepa que la comprobación es suya, y para que el día que se decida
    // rechazarlo aquí sea una decisión: ESTE caso es el que hay que actualizar,
    // y entonces el comando puede soltar su `min(1)`. Lo que no puede pasar es
    // que se convierta en un `return` temprano sin tocar nada, porque el
    // llamador lo leería como «recibido y cuadrado».
    expect(conexion.consultas.filter((c) => c.sql.startsWith('update "traspaso_lineas"'))).toEqual(
      [],
    );
    expect(conexion.consultas.filter((c) => c.sql.startsWith('update "traspasos"'))).toHaveLength(
      1,
    );
    // El único rastro de que no llegó nada: todas las líneas vuelven como
    // diferencia, y para eso el `select` tiene que correr igual.
    expect(conexion.consultas.filter((c) => c.sql.startsWith('select'))).toHaveLength(1);
  });
});
