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
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * «MI DÍA» ES DE UNA PERSONA, Y LO DICE EL SERVIDOR (C.7 de la 2.4).
 *
 * La pantalla preguntaba el nombre y enseñaba el día de quien se eligiera: cualquier
 * estilista leía la agenda, las comisiones y las liquidaciones de otra. Esto corre
 * `consultar` —el lector REAL del puente— sobre una conexión que apunta cada consulta, y
 * afirma que para el rol de la estilista (`mesero`) la consulta SÓLO puede devolver filas
 * de la profesional ligada a su empleo; para la recepción, todo el salón.
 *
 * Vista en ROJO sin el paso 1b de `consultar.ts`: la consulta de la estilista no nombra
 * `profesionales` y devuelve las filas de todas.
 */
const consultas: CompiledQuery[] = [];

class Grabadora implements DatabaseConnection {
  async executeQuery<R>(consulta: CompiledQuery): Promise<QueryResult<R>> {
    consultas.push(consulta);
    return { rows: [] };
  }
  async *streamQuery<R>(): AsyncIterableIterator<QueryResult<R>> {
    yield { rows: [] };
  }
}

const conexion = new Grabadora();
const driver: Driver = {
  init: () => Promise.resolve(),
  acquireConnection: () => Promise.resolve(conexion),
  beginTransaction: () => Promise.resolve(),
  commitTransaction: () => Promise.resolve(),
  rollbackTransaction: () => Promise.resolve(),
  releaseConnection: () => Promise.resolve(),
  destroy: () => Promise.resolve(),
};
const db = new Kysely<never>({
  dialect: {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => driver,
    createIntrospector: (k) => new PostgresIntrospector(k),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  },
});

vi.mock('@morphiqpos/data', async (original) => ({
  ...(await original<typeof import('@morphiqpos/data')>()),
  obtenerDb: () => db,
  leyendoConReintento: <T>(fn: () => Promise<T>) => fn(),
}));

const { consultar } = await import('./consultar.ts');

const SALON = '1747ccf9-3474-4233-bd87-60e2e188fa8b';
const KARLA = '55555555-5555-4555-8555-555555555555';

beforeEach(() => {
  consultas.length = 0;
});

describe('el recorte por persona del puente', () => {
  it.each(['CitaServicio', 'ComisionCausada', 'Liquidacion', 'Profesional'])(
    'la estilista sólo lee %s de SU profesional',
    async (entidad) => {
      await consultar(
        { organizacionId: SALON, rol: 'mesero', empleoId: KARLA },
        { entidad, operacion: 'list' },
      );
      const principal = consultas[0];
      expect(principal?.sql).toMatch(/from "profesionales"/);
      expect(principal?.sql).toMatch(/"empleo_id" = \$\d+/);
      expect(principal?.parameters).toContain(KARLA);
    },
  );

  it('sus citas son las que tienen algún servicio suyo', async () => {
    await consultar(
      { organizacionId: SALON, rol: 'mesero', empleoId: KARLA },
      { entidad: 'Cita', operacion: 'list' },
    );
    expect(consultas[0]?.sql).toMatch(/from "cita_servicios"/);
    expect(consultas[0]?.sql).toMatch(/from "profesionales"/);
    expect(consultas[0]?.parameters).toContain(KARLA);
  });

  it('sin empleo en el ámbito falla CERRADA: no busca a nadie, no devuelve a todas', async () => {
    await consultar(
      { organizacionId: SALON, rol: 'mesero' },
      { entidad: 'CitaServicio', operacion: 'list' },
    );
    expect(consultas[0]?.sql).toMatch(/from "profesionales"/);
    expect(consultas[0]?.parameters).not.toContain(KARLA);
  });

  it('la recepción y la dirección leen el salón entero', async () => {
    for (const rol of ['cajero', 'gerente', 'dueno']) {
      consultas.length = 0;
      await consultar(
        { organizacionId: SALON, rol, empleoId: KARLA },
        { entidad: 'CitaServicio', operacion: 'list' },
      );
      expect(consultas[0]?.sql, rol).not.toMatch(/from "profesionales"/);
    }
  });
});
