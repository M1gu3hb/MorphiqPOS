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
import { eliminarCorte } from './eliminacion.ts';

/**
 * El SQL que `caja.eliminar_corte` emite de verdad (E8-2).
 *
 * ── Por qué hace falta este archivo ────────────────────────────────────────
 * `eliminacion.test.ts` prueba el CUERPO del comando contra una base falsa, y
 * eso está bien para las decisiones. Pero su doble devuelve las filas crudas
 * declaradas para CUALQUIER consulta —`executeQuery: async () => ({ rows:
 * [...(opciones.filasCrudas ?? [])] })`—, así que la sentencia de
 * `referenciasDelCorte` NUNCA SE EJECUTA: se puede borrar una de sus seis
 * subconsultas y la suite sigue verde.
 *
 * Y ahí vive la regla entera del encargo. Si la subconsulta de pagos
 * desapareciera, un corte con pagos daría «cero referencias» y se borraría.
 *
 * Lo mismo con el `where tipo = 'apertura'` del único `delete` que se lleva
 * dinero: es el último seguro que impide que un fallo en la guarda arrastre
 * retiros, depósitos y ajustes del turno.
 *
 * Aquí no hay doble: hay un Kysely REAL, con el compilador de Postgres, sobre
 * una conexión que apunta lo que se le pide. Se afirma sobre el SQL COMPILADO.
 * Es el mismo patrón de `inventario/inventario.sql.test.ts`, por lo mismo.
 *
 * Lo que este archivo NO puede decir: que Postgres devuelva lo que creemos.
 * Eso se comprobó abriendo la aplicación contra la base real, que es la regla
 * que no se salta («nada se declara terminado sin haberlo abierto»).
 */

class ConexionGrabadora implements DatabaseConnection {
  readonly consultas: CompiledQuery[] = [];
  constructor(private readonly respuestas: readonly (readonly unknown[])[]) {}
  async executeQuery<R>(consulta: CompiledQuery): Promise<QueryResult<R>> {
    this.consultas.push(consulta);
    const rows = this.respuestas[this.consultas.length - 1] ?? [];
    return { rows: rows as R[], numAffectedRows: BigInt(rows.length) };
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

const ORG = '11111111-1111-4111-8111-111111111111';
const CORTE = '22222222-2222-4222-8222-222222222222';

/** Un corte cerrado, tal como lo devuelve `corteDeOrganizacion`. */
const CORTE_CERRADO = {
  id: CORTE,
  sucursalId: '33333333-3333-4333-8333-333333333333',
  terminalId: null,
  estado: 'cerrada',
  serie: 'A',
  folio: 7n,
  abiertaEn: new Date('2026-09-09T14:00:00Z'),
  cerradaEn: new Date('2026-09-09T23:30:00Z'),
  fondoInicialCentavos: 100000n,
  efectivoContadoCentavos: 350000n,
  efectivoRetiradoCentavos: 250000n,
};

const SIN_REFERENCIAS = {
  ventas: 0,
  pagos: 0,
  movimientos: 0,
  gastos: 0,
  cortes_turno: 0,
  liquidaciones: 0,
};

function contexto(respuestas: readonly (readonly unknown[])[]) {
  const conexion = new ConexionGrabadora(respuestas);
  const db = new Kysely({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => new DriverGrabador(conexion),
      createIntrospector: (kysely) => new PostgresIntrospector(kysely),
      createQueryCompiler: () => new PostgresQueryCompiler(),
    },
  });
  const auditorias: { readonly payload?: unknown }[] = [];
  const ctx: ContextoComando<Transaccion> = {
    tx: db as unknown as Transaccion,
    ambito: {
      organizacionId: ORG,
      sucursalId: '33333333-3333-4333-8333-333333333333',
      terminalId: null,
      identidadId: crypto.randomUUID(),
      empleoId: crypto.randomUUID(),
      rol: 'dueno',
    },
    correlationId: crypto.randomUUID(),
    ahora: new Date('2026-09-10T21:00:00Z'),
    paso: async (_nombre, fn) => fn(),
    auditar: (datos) => {
      auditorias.push(datos);
    },
  };
  return { ctx, conexion, auditorias };
}

/**
 * El camino completo: corte cerrado, sin referencias, se borra.
 *
 * Los dos `[{}]` del final son las filas afectadas de cada `delete`: el
 * grabador traduce `rows.length` a `numAffectedRows`, que es de donde el
 * repositorio saca `numDeletedRows`. Uno y uno: el renglón del fondo inicial y
 * el corte.
 */
function caminoFeliz() {
  return contexto([[CORTE_CERRADO], [SIN_REFERENCIAS], [{}], [{}]]);
}

describe('E8-2 · el SQL de caja.eliminar_corte', () => {
  it('cuenta las SEIS cosas que pueden apuntar a un corte, y ninguna menos', async () => {
    const { ctx, conexion } = caminoFeliz();

    await eliminarCorte.ejecutar(ctx, { corteId: CORTE });

    const conteo = conexion.consultas[1]?.sql ?? '';

    // Las seis. Si mañana alguien quita una, un corte con esa referencia daría
    // «cero» y se borraría: por eso están enumeradas una a una y no con un
    // «contiene la palabra select».
    expect(conteo).toMatch(/from ordenes\b/i);
    expect(conteo).toMatch(/from pagos\b/i);
    expect(conteo).toMatch(/from movimientos_caja\b/i);
    expect(conteo).toMatch(/from gastos\b/i);
    expect(conteo).toMatch(/from cortes_turno\b/i);
    expect(conteo).toMatch(/count\(distinct propina_liquidacion_id\)/i);

    // Y las seis acotadas al corte Y a la organización: contar las ventas de
    // otro negocio daría un «no se puede eliminar» falso, y no contarlas —si
    // faltara el `sesion_caja_id`— daría el permiso de borrado equivocado.
    expect(conteo.match(/organizacion_id = \$\d+/g) ?? []).toHaveLength(6);
    expect(conteo.match(/sesion_caja_id = \$\d+/g) ?? []).toHaveLength(6);
    expect(conteo).toMatch(/tipo <> 'apertura'/i);
  });

  it('el único DELETE que toca dinero va acotado a la apertura', async () => {
    const { ctx, conexion } = caminoFeliz();

    await eliminarCorte.ejecutar(ctx, { corteId: CORTE });

    const borradoDeMovimientos = conexion.consultas[2]?.sql ?? '';
    expect(borradoDeMovimientos).toMatch(/delete from "movimientos_caja"/i);
    // El seguro. Sin él, este `delete` se lleva retiros, depósitos y ajustes
    // del turno —dinero que entró o salió de verdad— y no sólo el renglón del
    // fondo inicial que el corte creó al abrirse.
    expect(borradoDeMovimientos).toMatch(/"tipo" = \$\d+/i);
    expect(conexion.consultas[2]?.parameters).toContain('apertura');
    expect(conexion.consultas[2]?.parameters).toContain(ORG);
    expect(conexion.consultas[2]?.parameters).toContain(CORTE);
  });

  it('el corte se borra sólo si sigue cerrado, y el hijo va antes que el padre', async () => {
    const { ctx, conexion } = caminoFeliz();

    await eliminarCorte.ejecutar(ctx, { corteId: CORTE });

    // El orden importa: la llave foránea es `restrict`, y al revés la
    // transacción entera aborta.
    expect(conexion.consultas[2]?.sql).toMatch(/movimientos_caja/i);
    expect(conexion.consultas[3]?.sql).toMatch(/delete from "sesiones_caja"/i);
    // `estado = 'cerrada'` en el propio DELETE: entre la lectura y el borrado
    // cabe una reapertura, y esta cláusula es lo que la respeta.
    expect(conexion.consultas[3]?.parameters).toContain('cerrada');
  });

  it('con una sola referencia NO se emite ningún DELETE', async () => {
    // La prueba de contraste. Sin ella, una guarda que no mirara el conteo
    // «pasaría» las tres de arriba igual de bien.
    const { ctx, conexion } = contexto([[CORTE_CERRADO], [{ ...SIN_REFERENCIAS, pagos: 3 }]]);

    await expect(eliminarCorte.ejecutar(ctx, { corteId: CORTE })).rejects.toThrow(/3 pagos/i);

    expect(conexion.consultas.filter((c) => /delete/i.test(c.sql))).toHaveLength(0);
  });

  it('si el conteo no devuelve fila se falla, en vez de suponer que hay cero', async () => {
    // Suponer cero aquí AUTORIZA un borrado. Es el mismo criterio que en el
    // resto del sistema: fallar en vez de silenciar.
    const { ctx, conexion } = contexto([[CORTE_CERRADO], []]);

    await expect(eliminarCorte.ejecutar(ctx, { corteId: CORTE })).rejects.toThrow(
      /no devolvió ninguna fila/i,
    );

    expect(conexion.consultas.filter((c) => /delete/i.test(c.sql))).toHaveLength(0);
  });
});
