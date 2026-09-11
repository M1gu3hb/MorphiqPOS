import type { Transaccion } from '@morphiqpos/data';
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

import type { ContextoComando } from '../comando.ts';
import { ajustarStock, inventarioInicial } from './inventario.ts';
import { guardarReceta, recalcularCostosRecetas } from './recetas.ts';

class ConexionGrabadora implements DatabaseConnection {
  readonly consultas: CompiledQuery[] = [];
  constructor(private readonly respuestas: readonly (readonly unknown[])[]) {}
  async executeQuery<R>(consulta: CompiledQuery): Promise<QueryResult<R>> {
    this.consultas.push(consulta);
    const rows = this.respuestas[this.consultas.length - 1] ?? [];
    return { rows: rows as R[] };
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

function contexto(respuestas: readonly (readonly unknown[])[]) {
  const conexion = new ConexionGrabadora(respuestas);
  const db = new Kysely<never>({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => new DriverGrabador(conexion),
      createIntrospector: (kysely) => new PostgresIntrospector(kysely),
      createQueryCompiler: () => new PostgresQueryCompiler(),
    },
  });
  const auditorias: unknown[] = [];
  const ctx: ContextoComando<Transaccion> = {
    tx: db as unknown as Transaccion,
    ambito: {
      organizacionId: crypto.randomUUID(),
      sucursalId: crypto.randomUUID(),
      terminalId: null,
      identidadId: crypto.randomUUID(),
      empleoId: crypto.randomUUID(),
      rol: 'dueno',
    },
    correlationId: crypto.randomUUID(),
    ahora: new Date('2026-09-09T00:00:00Z'),
    paso: async (_nombre, fn) => fn(),
    auditar: (datos) => {
      auditorias.push(datos);
    },
  };
  return { ctx, conexion, auditorias };
}

describe('B-11 · SQL de movimientos de inventario', () => {
  it('el inventario inicial acumula el saldo y escribe el ledger', async () => {
    const { ctx, conexion, auditorias } = contexto([
      [{ unidad_base: 'pieza', costo_unitario_centavos: 500n }],
      [{ cantidad: '8.0000' }],
      [],
    ]);
    await inventarioInicial.ejecutar(
      ctx,
      inventarioInicial.entrada.parse({
        almacenId: crypto.randomUUID(),
        insumoId: crypto.randomUUID(),
        cantidad: '8',
      }),
    );
    expect(conexion.consultas[1]?.sql).toMatch(/existencias\.cantidad\s*\+\s*excluded\.cantidad/i);
    expect(conexion.consultas[2]?.sql).toMatch(/insert\s+into\s+"movimientos_stock"/i);
    expect(conexion.consultas[2]?.parameters).toContain('inventario_inicial');
    expect(auditorias).toHaveLength(1);
  });

  it('el ajuste suma el delta con guarda y registra un movimiento', async () => {
    const { ctx, conexion } = contexto([
      [{ unidad_base: 'pieza', costo_unitario_centavos: 500n }],
      [],
      [{ cantidad: '6.0000' }],
      [],
    ]);
    await ajustarStock.ejecutar(
      ctx,
      ajustarStock.entrada.parse({
        almacenId: crypto.randomUUID(),
        insumoId: crypto.randomUUID(),
        cantidad: '-2',
        motivo: 'Conteo físico',
      }),
    );
    expect(conexion.consultas[2]?.sql).toMatch(/cantidad\s*\+\s*\$\d+\s*>=\s*0/i);
    expect(conexion.consultas[3]?.parameters).toContain('ajuste');
    expect(conexion.consultas[3]?.parameters).toContain('-2');
  });
});

describe('B-12 · SQL de costeo por receta', () => {
  it('multiplica costo por cantidad y merma antes de actualizar productos', async () => {
    const { ctx, conexion } = contexto([
      [{ id: crypto.randomUUID() }, { id: crypto.randomUUID() }],
    ]);
    const actualizados = await recalcularCostosRecetas(ctx.tx, ctx.ambito.organizacionId);
    expect(actualizados).toBe(2);
    expect(conexion.consultas[0]?.sql).toMatch(
      /costo_unitario_centavos::numeric\s*\*\s*r\.cantidad/i,
    );
    expect(conexion.consultas[0]?.sql).toMatch(/10000\s*\+\s*r\.merma_bp/i);
    expect(conexion.consultas[0]?.sql).toMatch(
      /set\s+costo_unitario_centavos\s*=\s*costos\.costo/i,
    );
  });
});

describe('B-12 · quitar el último ingrediente deja el producto SIN receta', () => {
  it('con la lista vacía no se emite ningún INSERT, sólo el DELETE', async () => {
    // Aquí `sql.join([])` dejaba el `values` a secas y Postgres respondía
    // «syntax error at end of input» (42601). No lo veía ninguna prueba porque
    // la base falsa no compila el SQL crudo: el usuario quitaba el último
    // ingrediente, guardaba, y leía «Algo falló de nuestro lado».
    const { ctx, conexion } = contexto([[{ id: crypto.randomUUID() }], [], [], []]);

    await guardarReceta.ejecutar(
      ctx,
      guardarReceta.entrada.parse({ productoId: crypto.randomUUID(), ingredientes: [] }),
    );

    const sentencias = conexion.consultas.map((c) => c.sql);
    expect(sentencias.some((q) => /delete\s+from\s+recetas/i.test(q))).toBe(true);
    expect(sentencias.some((q) => /insert\s+into\s+recetas/i.test(q))).toBe(false);
    // Y ninguna con un `values` vacío, que es la forma exacta del defecto.
    expect(sentencias.some((q) => /values\s*$/i.test(q.trim()))).toBe(false);
  });

  it('el producto pasa a `sku`: sin líneas no hay nada que consumir', async () => {
    const { ctx, conexion } = contexto([[{ id: crypto.randomUUID() }], [], [], []]);

    await guardarReceta.ejecutar(
      ctx,
      guardarReceta.entrada.parse({ productoId: crypto.randomUUID(), ingredientes: [] }),
    );

    const actualiza = conexion.consultas.find((c) => /update\s+"productos"/i.test(c.sql));
    expect(actualiza?.parameters).toContain('sku');
    expect(actualiza?.parameters).not.toContain('receta');
  });
});
