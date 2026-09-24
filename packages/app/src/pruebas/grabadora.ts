/**
 * Una conexión de Kysely que APUNTA el SQL compilado y devuelve filas de guion.
 *
 * Con el envoltorio REAL (`crearComando`) sobre una definición REAL, deja afirmar sin
 * base qué consultas salen y en qué orden —y, sobre todo, cuáles NO salen—. No prueba
 * que Postgres revierta de verdad; esa mitad la cubren las pruebas de integración.
 */
import type { Transaccion } from '@morphiqpos/data';
import type { Paquete } from '@morphiqpos/contracts';
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

import { crearComando } from '../comando.ts';
import type { RepositorioComandos } from '../repositorio.ts';
import { crearFabrica } from './dobles.ts';

export class ConexionGrabadora implements DatabaseConnection {
  readonly consultas: CompiledQuery[] = [];
  constructor(private readonly respuestas: readonly (readonly unknown[])[]) {}
  async executeQuery<R>(consulta: CompiledQuery): Promise<QueryResult<R>> {
    this.consultas.push(consulta);
    const filas = this.respuestas[this.consultas.length - 1] ?? [];
    return { rows: filas as R[] };
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

/** El envoltorio real sobre una conexión grabadora, con su fábrica de dobles. */
export function arnesGrabador(
  respuestas: readonly (readonly unknown[])[],
  paquete: Paquete = 'restaurante',
) {
  const conexion = new ConexionGrabadora(respuestas);
  const db = new Kysely<never>({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => new DriverGrabador(conexion),
      createIntrospector: (kysely) => new PostgresIntrospector(kysely),
      createQueryCompiler: () => new PostgresQueryCompiler(),
    },
  });
  const fabrica = crearFabrica(paquete);
  const ejecutar = crearComando<Transaccion>({
    repositorio: fabrica.repositorio as unknown as RepositorioComandos<Transaccion>,
    conTransaccion: <T>(fn: (tx: Transaccion) => Promise<T>): Promise<T> =>
      fabrica.conTransaccion(() => fn(db as unknown as Transaccion)),
  });
  return { ejecutar, conexion, fabrica };
}
