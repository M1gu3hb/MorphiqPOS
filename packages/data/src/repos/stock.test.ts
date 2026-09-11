import { ErrorDominio } from '@morphiqpos/contracts/errores';
import type { MovimientoPlaneado } from '@morphiqpos/domain/inventario';
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
import { aplicarMovimientos } from './stock.ts';

type Respuesta = 'fila' | 'vacia' | 'error';

class ConexionGrabadora implements DatabaseConnection {
  readonly consultas: CompiledQuery[] = [];

  constructor(private readonly respuestas: Respuesta[]) {}

  async executeQuery<R>(consulta: CompiledQuery): Promise<QueryResult<R>> {
    this.consultas.push(consulta);
    const respuesta = this.respuestas.shift() ?? 'vacia';
    if (respuesta === 'error') throw new Error('base no disponible');
    const rows = respuesta === 'fila' ? [{ cantidad: '7.0000' }] : [];
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

function crearTx(respuestas: Respuesta[]): {
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
  return { tx: db as unknown as Transaccion, conexion };
}

const movimiento: MovimientoPlaneado = {
  organizacionId: '10000000-0000-0000-0000-000000000001',
  almacenId: '20000000-0000-0000-0000-000000000001',
  insumoId: '30000000-0000-0000-0000-000000000001',
  tipo: 'salida_venta',
  cantidad: '3.25',
  unidad: 'kg',
  permiteNegativo: false,
  referenciaTipo: 'orden',
  referenciaId: '40000000-0000-0000-0000-000000000001',
  empleadoId: '50000000-0000-0000-0000-000000000001',
  idempotencyKey: 'inventario:orden-a:insumo-a',
  origenes: ['linea-a'],
};

describe('INV-03 · repositorio de stock', () => {
  it('decrementa con una guarda atómica por organización y después inserta el ledger', async () => {
    const { tx, conexion } = crearTx(['fila', 'vacia']);

    await aplicarMovimientos([movimiento], tx);

    expect(conexion.consultas).toHaveLength(2);
    const decremento = conexion.consultas[0]!;
    expect(decremento.sql).toMatch(/update\s+existencias/i);
    expect(decremento.sql).toMatch(/cantidad\s*=\s*cantidad\s*-\s*\$1/i);
    expect(decremento.sql).toMatch(/organizacion_id\s*=\s*\$2/i);
    expect(decremento.sql).toMatch(/almacen_id\s*=\s*\$3/i);
    expect(decremento.sql).toMatch(/insumo_id\s*=\s*\$4/i);
    expect(decremento.sql).toMatch(/cantidad\s*>=\s*\$5\s+or\s+\$6/i);
    expect(decremento.parameters).toEqual([
      '3.25',
      movimiento.organizacionId,
      movimiento.almacenId,
      movimiento.insumoId,
      '3.25',
      false,
    ]);

    const ledger = conexion.consultas[1]!;
    expect(ledger.sql).toMatch(/insert\s+into\s+movimientos_stock/i);
    expect(ledger.parameters).toContain('-3.25');
    expect(ledger.parameters).toContain('salida_venta');
    expect(ledger.parameters).toContain(movimiento.referenciaId);
    expect(ledger.parameters).toContain(movimiento.idempotencyKey);
  });

  it('falla sin insertar ledger cuando la guarda de stock no actualiza la fila', async () => {
    const { tx, conexion } = crearTx(['vacia']);

    const promesa = aplicarMovimientos([movimiento], tx);

    await expect(promesa).rejects.toMatchObject({ codigo: 'STOCK_INSUFICIENTE' });
    expect(conexion.consultas).toHaveLength(1);
    expect(conexion.consultas[0]!.sql).toMatch(/update\s+existencias/i);
  });

  it('envía la política de negativo como parámetro de la misma guarda', async () => {
    const { tx, conexion } = crearTx(['vacia', 'fila', 'vacia']);

    await aplicarMovimientos([{ ...movimiento, permiteNegativo: true }], tx);

    expect(conexion.consultas[1]!.parameters.at(-1)).toBe(true);
  });

  it('crea la existencia ausente y permite dejarla negativa cuando la política lo autoriza', async () => {
    const { tx, conexion } = crearTx(['vacia', 'fila', 'vacia']);

    await aplicarMovimientos([{ ...movimiento, permiteNegativo: true }], tx);

    expect(conexion.consultas).toHaveLength(3);
    const inicializacion = conexion.consultas[0]!;
    expect(inicializacion.sql).toMatch(/insert\s+into\s+existencias/i);
    expect(inicializacion.sql).toMatch(
      /on\s+conflict\s*\(almacen_id,\s*insumo_id\)\s+do\s+nothing/i,
    );
    expect(inicializacion.parameters).toEqual([
      movimiento.organizacionId,
      movimiento.almacenId,
      movimiento.insumoId,
    ]);

    const decremento = conexion.consultas[1]!;
    expect(decremento.sql).toMatch(/cantidad\s*=\s*cantidad\s*-\s*\$1/i);
    expect(decremento.parameters.at(-1)).toBe(true);
    expect(conexion.consultas[2]!.sql).toMatch(/insert\s+into\s+movimientos_stock/i);
  });

  it('ordena los bloqueos por saldo y escribe todos los movimientos en un solo insert', async () => {
    const segundo = {
      ...movimiento,
      insumoId: '30000000-0000-0000-0000-000000000000',
      idempotencyKey: 'inventario:orden-a:insumo-b',
    };
    const { tx, conexion } = crearTx(['fila', 'fila', 'vacia']);

    await aplicarMovimientos([movimiento, segundo], tx);

    expect(conexion.consultas).toHaveLength(3);
    expect(conexion.consultas[0]!.parameters).toContain(segundo.insumoId);
    expect(conexion.consultas[1]!.parameters).toContain(movimiento.insumoId);
    expect(conexion.consultas[2]!.sql).toMatch(/insert\s+into\s+movimientos_stock/i);
    expect(conexion.consultas[2]!.sql.match(/\),\s*\(/g)).toHaveLength(1);
  });

  it('propaga un fallo de base para que la transacción que recibió revierta', async () => {
    const { tx, conexion } = crearTx(['error']);

    await expect(aplicarMovimientos([movimiento], tx)).rejects.toThrow('base no disponible');
    expect(conexion.consultas).toHaveLength(1);
  });

  it('rechaza cantidades cero antes de tocar la base', async () => {
    const { tx, conexion } = crearTx([]);

    await expect(aplicarMovimientos([{ ...movimiento, cantidad: '0' }], tx)).rejects.toBeInstanceOf(
      ErrorDominio,
    );
    expect(conexion.consultas).toHaveLength(0);
  });

  it('no ejecuta consultas si no hay movimientos', async () => {
    const { tx, conexion } = crearTx([]);
    await aplicarMovimientos([], tx);
    expect(conexion.consultas).toHaveLength(0);
  });
});
