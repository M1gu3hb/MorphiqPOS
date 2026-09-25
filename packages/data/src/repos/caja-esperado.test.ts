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
import { cerrarSesion } from './caja.ts';

/**
 * EL CIERRE GUARDA EL ESPERADO Y LA DIFERENCIA (C.4 de la 2.4).
 *
 * La migración 100 creó `efectivo_esperado_centavos` y `diferencia_centavos` en
 * `sesiones_caja` —«se guarda calculada y no se deduce después»— y `caja.cerrar` nunca
 * las escribió: el histórico de cortes no podía enseñar la diferencia de un corte
 * anterior. El encargo pedía una migración nueva; el ensayo con datos de esa migración
 * la rechazó —«la columna ya existe»— y así se supo. Esto corre `cerrarSesion` sobre una
 * conexión que apunta cada consulta.
 *
 * Vista en ROJO sobre el `cerrarSesion` de antes: el `update` no nombraba ninguna de las
 * dos columnas.
 */
class Grabadora implements DatabaseConnection {
  readonly consultas: CompiledQuery[] = [];
  constructor(private readonly respuestas: readonly (readonly unknown[])[]) {}
  async executeQuery<R>(consulta: CompiledQuery): Promise<QueryResult<R>> {
    this.consultas.push(consulta);
    const filas = this.respuestas[this.consultas.length - 1] ?? [];
    return { rows: filas as R[], numAffectedRows: 1n };
  }
  async *streamQuery<R>(): AsyncIterableIterator<QueryResult<R>> {
    yield { rows: [] };
  }
}

function base(respuestas: readonly (readonly unknown[])[]) {
  const conexion = new Grabadora(respuestas);
  const driver: Driver = {
    init: () => Promise.resolve(),
    acquireConnection: () => Promise.resolve(conexion),
    beginTransaction: () => Promise.resolve(),
    commitTransaction: () => Promise.resolve(),
    rollbackTransaction: () => Promise.resolve(),
    releaseConnection: () => Promise.resolve(),
    destroy: () => Promise.resolve(),
  };
  const db = new Kysely<Esquema>({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => driver,
      createIntrospector: (k) => new PostgresIntrospector(k),
      createQueryCompiler: () => new PostgresQueryCompiler(),
    },
  });
  return { db: db as unknown as Transaccion, conexion };
}

const CIERRE = {
  organizacionId: '1c20ddfe-535d-480c-88eb-f0d2efe3d750',
  sucursalId: '22222222-2222-4222-8222-222222222222',
  sesionCajaId: '33333333-3333-4333-8333-333333333333',
  serie: 'A',
  empleadoCierraId: '55555555-5555-4555-8555-555555555555',
  efectivoContadoCentavos: 150_000n,
  efectivoEsperadoCentavos: 151_250n,
  notasCierre: null,
  ahora: new Date('2026-09-24T18:00:00Z'),
} as const;

describe('repoCaja.cerrarSesion · el esperado y la diferencia', () => {
  it('guarda el esperado que comparó y la diferencia, contado menos esperado', async () => {
    const { db, conexion } = base([[], [{ siguiente: 7n }], []]);
    await cerrarSesion(db, CIERRE);
    const update = conexion.consultas.at(-1);
    expect(update?.sql).toMatch(/update "sesiones_caja"/);
    expect(update?.sql).toMatch(/"efectivo_esperado_centavos" =/);
    expect(update?.sql).toMatch(/"diferencia_centavos" =/);
    expect(update?.parameters).toContain(151_250n);
    // 1 500.00 contados contra 1 512.50 esperados: faltan 12.50.
    expect(update?.parameters).toContain(-1_250n);
  });
});
