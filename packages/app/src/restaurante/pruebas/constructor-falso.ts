/**
 * El trozo del constructor de consultas de Kysely que estos comandos usan.
 *
 * `selectFrom`, `insertInto`, `updateTable` y `deleteFrom` sobre arreglos en
 * memoria, con `where`, `orderBy`, `limit` y `returning`. Ni una pieza más: no
 * es un mock de Kysely, es lo justo para que el CUERPO de un comando corra de
 * principio a fin y se pueda afirmar qué leyó y qué dejó escrito.
 *
 * Los `join` se aceptan y se ignoran: la fila sembrada ya trae las columnas que
 * el `leftJoin` real traería. Falsear el planificador sería reimplementar
 * Postgres, y probar contra una reimplementación no prueba nada.
 */

export type Fila = Record<string, unknown>;

export interface Filtro {
  readonly columna: string;
  readonly operador: string;
  readonly valor: unknown;
}

/** `p.estacion_id as estacionId` → `estacion_id`. */
export function origen(expresion: string): string {
  const sinAlias = expresion.split(' as ')[0] ?? expresion;
  const partes = sinAlias.split('.');
  return partes[partes.length - 1] ?? sinAlias;
}

/** `p.estacion_id as estacionId` → `estacionId`. */
function destino(expresion: string): string {
  const partes = expresion.split(' as ');
  return partes.length > 1 ? partes[1]! : origen(expresion);
}

/**
 * El valor de una columna, con la ruta completa antes que el nombre pelado.
 *
 * `ib.nombre as insumoBaseNombre` y `p.nombre as nombre` piden los dos la
 * columna `nombre` de tablas distintas. Buscando primero la clave literal
 * `'ib.nombre'`, una fila sembrada puede distinguirlas cuando la prueba lo
 * necesita, y cuando no, el nombre pelado sigue bastando.
 */
function valorDe(fila: Fila, expresion: string): unknown {
  const ruta = expresion.split(' as ')[0] ?? expresion;
  return ruta in fila ? fila[ruta] : fila[origen(ruta)];
}

function cumple(fila: Fila, filtro: Filtro): boolean {
  const actual = valorDe(fila, filtro.columna) ?? null;
  const esperado = filtro.valor ?? null;
  const lista = Array.isArray(esperado) ? esperado : [];

  switch (filtro.operador) {
    case '=':
    case 'is':
      return igual(actual, esperado);
    case '<>':
    case '!=':
    case 'is not':
      return !igual(actual, esperado);
    case 'in':
      return lista.some((v) => igual(actual, v));
    case 'not in':
      return !lista.some((v) => igual(actual, v));
    default:
      throw new Error(`La base falsa no implementa el operador «${filtro.operador}».`);
  }
}

/** Las fechas se comparan por valor: dos `Date` iguales no son `===`. */
function igual(a: unknown, b: unknown): boolean {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  return a === b;
}

interface Agregado {
  readonly funcion: 'max';
  readonly columna: string;
  readonly alias: string;
}

type Selector = string | readonly string[] | ((eb: ConstructorExpresion) => Agregado);

interface ConstructorExpresion {
  readonly fn: { max(columna: string): { as(alias: string): Agregado } };
}

const EXPRESION: ConstructorExpresion = {
  fn: { max: (columna) => ({ as: (alias) => ({ funcion: 'max', columna, alias }) }) },
};

function proyectar(fila: Fila, selectores: readonly Selector[]): Fila {
  const expresiones: string[] = [];
  for (const selector of selectores) {
    if (typeof selector === 'string') {
      expresiones.push(selector);
    } else if (typeof selector === 'object') {
      expresiones.push(...selector);
    } else {
      // `items.ts` calcula el mínimo con un `sql`min(case …)`` DENTRO del
      // `select`. Modelarlo aquí sería reimplementar el motor de Postgres: esa
      // rama se prueba contra una base real. Se falla diciendo por qué, en vez
      // de reventar con un «no es iterable» que no explica nada.
      throw new Error('La base falsa no modela agregados crudos en `select`.');
    }
  }
  if (expresiones.length === 0) return { ...fila };

  const salida: Fila = {};
  for (const expresion of expresiones) salida[destino(expresion)] = valorDe(fila, expresion) ?? null;
  return salida;
}

function comparar(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b));
}

export function lectura(filas: Fila[]) {
  const filtros: Filtro[] = [];
  const selectores: Selector[] = [];
  let orden: { columna: string; descendente: boolean } | null = null;
  let tope: number | null = null;

  const resolver = (): Fila[] => {
    let vivas = filas.filter((fila) => filtros.every((filtro) => cumple(fila, filtro)));

    if (orden !== null) {
      const { columna, descendente } = orden;
      vivas = [...vivas].sort((a, b) => comparar(a[columna], b[columna]) * (descendente ? -1 : 1));
    }
    if (tope !== null) vivas = vivas.slice(0, tope);

    const agregado = selectores.find((s) => typeof s === 'function');
    if (typeof agregado === 'function') {
      const { columna, alias } = agregado(EXPRESION);
      const numeros = vivas.map((f) => Number(f[columna] ?? 0));
      // Un agregado sobre cero filas devuelve UNA fila con `null`, como
      // Postgres: `siguienteOrdenVisual` depende de eso para empezar en 1.
      return [{ [alias]: numeros.length === 0 ? null : Math.max(...numeros) }];
    }

    return vivas.map((fila) => proyectar(fila, selectores));
  };

  const constructor = {
    select(selector: Selector) {
      selectores.push(selector);
      return constructor;
    },
    leftJoin() {
      return constructor;
    },
    where(columna: string, operador: string, valor: unknown) {
      filtros.push({ columna, operador, valor });
      return constructor;
    },
    orderBy(columna: string, direccion?: string) {
      orden = { columna: origen(columna), descendente: direccion === 'desc' };
      return constructor;
    },
    limit(cuantas: number) {
      tope = cuantas;
      return constructor;
    },
    async execute() {
      return resolver();
    },
    async executeTakeFirst() {
      return resolver()[0];
    },
    async executeTakeFirstOrThrow() {
      const fila = resolver()[0];
      if (fila === undefined) throw new Error('La consulta no devolvió ninguna fila.');
      return fila;
    },
  };
  return constructor;
}

/**
 * `predeterminados` son las clausulas `default` de la migracion.
 *
 * `filaDeLinea` no escribe `descuento_centavos` porque la tabla lo declara
 * `default 0`, y sin esto la fila insertada saldria sin la columna y `cotizar`
 * reventaria con NaN. La base falsa no inventa el valor: la prueba declara el
 * `default` que la migracion ya declara.
 */
export function insercion(filas: Fila[], predeterminados: Fila = {}) {
  const nuevas: Fila[] = [];
  let devuelta: string | null = null;

  const constructor = {
    values(valores: Fila | readonly Fila[]) {
      const lista: readonly Fila[] = Array.isArray(valores) ? valores : [valores as Fila];
      for (const fila of lista) {
        nuevas.push({ id: crypto.randomUUID(), ...predeterminados, ...fila });
      }
      return constructor;
    },
    returning(columna: string) {
      devuelta = columna;
      return constructor;
    },
    async execute() {
      filas.push(...nuevas);
      return nuevas.map((fila) => (devuelta === null ? {} : proyectar(fila, [devuelta])));
    },
    async executeTakeFirst() {
      return (await constructor.execute())[0];
    },
    async executeTakeFirstOrThrow() {
      const fila = (await constructor.execute())[0];
      if (fila === undefined) throw new Error('El insert no devolvió ninguna fila.');
      return fila;
    },
  };
  return constructor;
}

export function actualizacion(filas: Fila[]) {
  const filtros: Filtro[] = [];
  let cambios: Fila = {};
  let devuelta: string | null = null;

  const aplicar = (): Fila[] => {
    const tocadas: Fila[] = [];
    for (const [indice, fila] of filas.entries()) {
      if (!filtros.every((filtro) => cumple(fila, filtro))) continue;
      const actualizada = { ...fila, ...cambios };
      filas[indice] = actualizada;
      tocadas.push(actualizada);
    }
    return tocadas;
  };

  const constructor = {
    set(valores: Fila) {
      cambios = valores;
      return constructor;
    },
    where(columna: string, operador: string, valor: unknown) {
      filtros.push({ columna, operador, valor });
      return constructor;
    },
    returning(columna: string) {
      devuelta = columna;
      return constructor;
    },
    async execute() {
      const tocadas = aplicar();
      if (devuelta === null) return [{ numUpdatedRows: BigInt(tocadas.length) }];
      const columna = devuelta;
      return tocadas.map((fila) => proyectar(fila, [columna]));
    },
    async executeTakeFirst() {
      const tocadas = aplicar();
      const primera = tocadas[0];
      if (devuelta === null) return { numUpdatedRows: BigInt(tocadas.length) };
      return primera === undefined ? undefined : proyectar(primera, [devuelta]);
    },
  };
  return constructor;
}

export function borrado(filas: Fila[]) {
  const filtros: Filtro[] = [];

  const constructor = {
    where(columna: string, operador: string, valor: unknown) {
      filtros.push({ columna, operador, valor });
      return constructor;
    },
    async executeTakeFirst() {
      const sobreviven = filas.filter((fila) => !filtros.every((f) => cumple(fila, f)));
      const borradas = filas.length - sobreviven.length;
      filas.splice(0, filas.length, ...sobreviven);
      return { numDeletedRows: BigInt(borradas) };
    },
  };
  return constructor;
}
