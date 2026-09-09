import type { ContextoComando } from '../comando.ts';
import type { Transaccion } from '@morphiqpos/data';

export interface OperacionSqlFalsa {
  readonly tipo: 'insert' | 'update' | 'delete' | 'select';
  readonly tabla: string;
  valores?: unknown;
  readonly filtros: {
    readonly columna: string;
    readonly operador: string;
    readonly valor: unknown;
  }[];
}

class ConsultaFalsa {
  constructor(
    private readonly operacion: OperacionSqlFalsa,
    private readonly respuestas: unknown[],
  ) {}

  values(valores: unknown): this {
    this.operacion.valores = valores;
    return this;
  }

  set(valores: unknown): this {
    this.operacion.valores = valores;
    return this;
  }

  where(columna: string, operador: string, valor: unknown): this {
    this.operacion.filtros.push({ columna, operador, valor });
    return this;
  }

  leftJoin(): this {
    return this;
  }

  select(): this {
    return this;
  }

  returning(): this {
    return this;
  }

  onConflict(): this {
    return this;
  }

  execute(): Promise<readonly unknown[]> {
    this.respuestas.shift();
    return Promise.resolve([]);
  }

  executeTakeFirst(): Promise<unknown> {
    return Promise.resolve(this.respuestas.shift());
  }

  executeTakeFirstOrThrow(): Promise<unknown> {
    const respuesta = this.respuestas.shift();
    return respuesta === undefined
      ? Promise.reject(new Error('La consulta falsa no recibió respuesta.'))
      : Promise.resolve(respuesta);
  }
}

export function contextoCatalogo(respuestas: unknown[] = []): {
  readonly ctx: ContextoComando<Transaccion>;
  readonly operaciones: OperacionSqlFalsa[];
  readonly auditorias: { entidadId: string | null; payload: Record<string, unknown> }[];
} {
  const operaciones: OperacionSqlFalsa[] = [];
  const auditorias: { entidadId: string | null; payload: Record<string, unknown> }[] = [];
  const consulta = (tipo: OperacionSqlFalsa['tipo'], tabla: string): ConsultaFalsa => {
    const operacion: OperacionSqlFalsa = { tipo, tabla, filtros: [] };
    operaciones.push(operacion);
    return new ConsultaFalsa(operacion, respuestas);
  };
  const tx = {
    selectFrom: (tabla: string) => consulta('select', tabla),
    insertInto: (tabla: string) => consulta('insert', tabla),
    updateTable: (tabla: string) => consulta('update', tabla),
    deleteFrom: (tabla: string) => consulta('delete', tabla),
  } as unknown as Transaccion;

  return {
    ctx: {
      tx,
      ambito: {
        organizacionId: '11111111-1111-4111-8111-111111111111',
        sucursalId: '22222222-2222-4222-8222-222222222222',
        terminalId: null,
        identidadId: '33333333-3333-4333-8333-333333333333',
        empleoId: '44444444-4444-4444-8444-444444444444',
        rol: 'dueno',
      },
      correlationId: '55555555-5555-4555-8555-555555555555',
      ahora: new Date('2026-09-08T00:00:00Z'),
      paso: async (_nombre, ejecutar) => ejecutar(),
      auditar: (datos) => auditorias.push(datos),
    },
    operaciones,
    auditorias,
  };
}
