import type { Ambito, Paquete } from '@morphiqpos/contracts';
import type { Esquema, Transaccion } from '@morphiqpos/data';
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

import { crearComando, type ContextoComando, type RepositorioComandos } from '../comando.ts';
import { crearFabrica } from '../pruebas/dobles.ts';

/**
 * Andamiaje de pruebas de propinas: ejecuta el CUERPO de los comandos.
 *
 * No es código de producción y `index.ts` no lo exporta. Vive aquí y no en un
 * `.test.ts` porque lo comparten dos archivos de pruebas, y vive en este módulo
 * y no en `src/pruebas/` porque conoce cosas que sólo importan aquí.
 *
 * ── Por qué existe ─────────────────────────────────────────────────────────
 * Es el bloqueante 2 del veredicto. Las pruebas anteriores llamaban a
 * `liquidarPropinas` con `ejecutorDeProduccion`, que entrega una `TxFalsa`; las
 * cuatro morían en las puertas —paquete, rol, idempotencia— ANTES de `ejecutar`,
 * así que el cuerpo del comando tenía cobertura CERO. El verificador lo demostró
 * saboteando `liquidar.ts` en tres sitios a la vez —total fijo en 1, la guarda
 * de doble liquidación neutralizada, la lista de órdenes ignorada— y viendo
 * pasar las 34 pruebas.
 *
 * Aquí la transacción es un `Kysely` de verdad enchufado a un driver que no
 * habla con nadie: COMPILA cada consulta con el mismo compilador de Postgres que
 * en producción, la anota y devuelve filas de guardarropía. Eso permite afirmar
 * sobre el SQL exacto y sus parámetros, que es donde viven los defectos que se
 * cierran: de qué tabla sale el folio, si el `WHERE` acota la sucursal, qué
 * importe viaja al `UPDATE` del total.
 *
 * Lo que este banco NO prueba es que Postgres haga lo que el SQL dice — eso es
 * de las pruebas de integración. Prueba la otra mitad, la que no existía: que el
 * comando emita el SQL correcto y que falle cuando tiene que fallar.
 */

/** Una conexión que compila, anota y responde con filas preparadas. */
class ConexionGrabadora implements DatabaseConnection {
  readonly consultas: CompiledQuery[] = [];

  constructor(private readonly respuestas: readonly (readonly unknown[])[]) {}

  executeQuery<R>(consulta: CompiledQuery): Promise<QueryResult<R>> {
    this.consultas.push(consulta);
    const filas = this.respuestas[this.consultas.length - 1] ?? [];
    return Promise.resolve({ rows: filas as R[] });
  }

  streamQuery<R>(): AsyncIterableIterator<QueryResult<R>> {
    // Ninguna consulta de propinas se sirve en flujo. Devolver un flujo vacío
    // haría que una prueba futura afirmara sobre cero filas creyendo que las
    // pidió: es mejor que reviente y se vea.
    throw new Error('El banco de pruebas no sirve consultas en flujo.');
  }
}

class DriverGrabador implements Driver {
  constructor(private readonly conexion: ConexionGrabadora) {}
  init(): Promise<void> {
    return Promise.resolve();
  }
  acquireConnection(): Promise<DatabaseConnection> {
    return Promise.resolve(this.conexion);
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

export interface Banco {
  /** Las consultas compiladas, en el orden en que el comando las emitió. */
  readonly conexion: ConexionGrabadora;
  /** La transacción que recibe el cuerpo del comando. */
  readonly tx: Transaccion;
  /** `false` si el envoltorio revirtió: es lo que prueba la atomicidad. */
  confirmada(): boolean;
  /** El ejecutor real —puertas incluidas— sobre esa transacción. */
  readonly ejecutar: ReturnType<typeof crearComando<Transaccion>>;
}

/**
 * Arma un banco con las respuestas que la base dará, EN ORDEN.
 *
 * Por posición y no por nombre de tabla a propósito: si alguien mete una
 * consulta en medio, el orden se desplaza y las pruebas cambian de color. Una
 * prueba que sobrevive a que le inserten una consulta nueva en el medio no está
 * mirando el comando, está mirando un resumen suyo.
 */
export function armarBanco(paquete: Paquete, respuestas: readonly (readonly unknown[])[]): Banco {
  const conexion = new ConexionGrabadora(respuestas);
  const db = new Kysely<Esquema>({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => new DriverGrabador(conexion),
      createIntrospector: (kysely) => new PostgresIntrospector(kysely),
      createQueryCompiler: () => new PostgresQueryCompiler(),
    },
  });
  // `Transaccion` es `Transaction<Esquema>`, que sólo añade `commit` y
  // `rollback` sobre `Kysely<Esquema>`. El cuerpo de un comando no llama a esos
  // dos —los llama el envoltorio, y aquí los sustituye `conTransaccion`—, así
  // que la aserción es exacta para todo lo que se ejecuta.
  const tx = db as Transaccion;

  const fabrica = crearFabrica(paquete);

  const ejecutar = crearComando<Transaccion>({
    repositorio: repositorioSobre(fabrica.repositorio),
    // La contabilidad de confirmación y reversión sigue siendo la de la
    // fábrica: lo único que cambia es QUÉ transacción ve el cuerpo.
    conTransaccion: <T>(fn: (t: Transaccion) => Promise<T>): Promise<T> =>
      fabrica.conTransaccion(() => fn(tx)),
  });

  return {
    conexion,
    tx,
    ejecutar,
    confirmada: () => fabrica.base.transacciones.at(-1)?.confirmada === true,
  };
}

/**
 * El repositorio del envoltorio, con la transacción de verdad.
 *
 * `crearFabrica` lo declara sobre `TxFalsa`; ninguna de sus seis funciones mira
 * la transacción —guardan en memoria—, así que se reenvían con la que sea. Se
 * reescribe a mano en vez de forzar el tipo con un `as unknown as` para que un
 * cambio de firma en `RepositorioComandos` rompa aquí en vez de colarse.
 */
function repositorioSobre(memoria: RepositorioComandos<unknown>): RepositorioComandos<Transaccion> {
  return {
    leerPaquete: (tx, organizacionId) => memoria.leerPaquete(tx, organizacionId),
    reclamarClave: (tx, datos) => memoria.reclamarClave(tx, datos),
    leerEjecucion: (tx, organizacionId, comando, clave) =>
      memoria.leerEjecucion(tx, organizacionId, comando, clave),
    completarEjecucion: (tx, datos) => memoria.completarEjecucion(tx, datos),
    registrarReintento: (organizacionId, comando, clave) =>
      memoria.registrarReintento(organizacionId, comando, clave),
    escribirAuditoria: (tx, fila) => memoria.escribirAuditoria(tx, fila),
  };
}

/** La administradora de la sucursal Centro. */
export const CENTRO: Ambito = {
  organizacionId: '00000000-0000-4000-8000-0000000000a1',
  sucursalId: '00000000-0000-4000-8000-00000000ce01',
  terminalId: '00000000-0000-4000-8000-0000000000a3',
  identidadId: '00000000-0000-4000-8000-0000000000a4',
  empleoId: '00000000-0000-4000-8000-0000000000a5',
  rol: 'administrador',
};

/** El gerente de Norte: MISMA organización, otra sucursal (bloqueante 1). */
export const NORTE: Ambito = {
  ...CENTRO,
  sucursalId: '00000000-0000-4000-8000-000000004e01',
  rol: 'gerente',
};

/** El texto de la consulta `indice`, en minúsculas y con un solo espacio. */
export function sqlDe(banco: Banco, indice: number): string {
  return (banco.conexion.consultas[indice]?.sql ?? '').replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Los parámetros de la consulta `indice`, como texto comparable.
 *
 * Los arreglos se aplanan un nivel: `${ids}::uuid[]` viaja como UN parámetro que
 * es un arreglo, y sin aplanar «contiene este identificador» no se podría
 * afirmar. Cuando lo que importa es la FORMA del parámetro —arreglo vacío contra
 * nulo, que es lo que distingue «ninguna orden» de «todas»— se usa
 * `parametrosCrudos`.
 */
export function parametrosDe(banco: Banco, indice: number): readonly string[] {
  return parametrosCrudos(banco, indice).flatMap((valor) =>
    Array.isArray(valor) ? valor.map((v: unknown) => String(v)) : [String(valor)],
  );
}

/** Los parámetros tal cual los recibiría el driver, sin convertir. */
export function parametrosCrudos(banco: Banco, indice: number): readonly unknown[] {
  return banco.conexion.consultas[indice]?.parameters ?? [];
}

/**
 * Un contexto de comando sobre el banco, para llamar a `ejecutar` por debajo de
 * zod.
 *
 * Sólo se usa donde hace falta comprobar que el CUERPO se defiende por su cuenta
 * de una entrada que el esquema ya rechaza. Dos guardas para el mismo defecto no
 * son redundancia: quitar una de ellas no puede reabrir el hueco en silencio.
 */
export function contextoDe(banco: Banco, ambito: Ambito): ContextoComando<Transaccion> {
  return {
    ambito,
    correlationId: '00000000-0000-4000-8000-0000000000ff',
    ahora: new Date('2026-09-09T12:00:00.000Z'),
    tx: banco.tx,
    paso: async (_nombre, fn) => fn(),
    auditar: () => undefined,
  };
}

/** Todo el SQL que el comando emitió, concatenado. Para afirmar ausencias. */
export function todoElSql(banco: Banco): string {
  return banco.conexion.consultas.map((_, i) => sqlDe(banco, i)).join(' | ');
}
