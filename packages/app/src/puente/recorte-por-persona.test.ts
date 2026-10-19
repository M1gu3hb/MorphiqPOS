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

/**
 * SUS CLIENTAS, Y SÓLO LAS SUYAS (cierre de la 2.4).
 *
 * La cabina de la estilista no podía leer a la clienta que tenía sentada —el puente le
 * negaba `Cliente`— y, en cambio, le servía el expediente y las fórmulas de CUALQUIER
 * clienta del salón. Ahora las tres entidades se recortan igual: a las clientas con una cita
 * que lleva un servicio de la profesional de su empleo.
 */
describe('el recorte por clienta propia', () => {
  it.each([
    ['Cliente', '"b"."id" in'],
    ['ExpedienteBelleza', '"b"."cliente_id" in'],
    ['FormulaAplicada', '"b"."cliente_id" in'],
  ])('la estilista sólo lee %s de las clientas que atiende', async (entidad, columna) => {
    await consultar(
      { organizacionId: SALON, rol: 'mesero', empleoId: KARLA },
      { entidad, operacion: 'list' },
    );
    const sql = consultas[0]?.sql ?? '';
    expect(sql).toContain(columna);
    expect(sql).toMatch(/select "cliente_id" from "citas"/);
    expect(sql).toMatch(/from "cita_servicios"/);
    expect(sql).toMatch(/from "profesionales"/);
    expect(consultas[0]?.parameters).toContain(KARLA);
  });

  it('a la estilista no le llegan ni el contacto, ni lo fiscal, ni el crédito', async () => {
    await consultar(
      { organizacionId: SALON, rol: 'mesero', empleoId: KARLA },
      { entidad: 'Cliente', operacion: 'list' },
    );
    const sql = consultas[0]?.sql ?? '';
    expect(sql).toContain('as "nombre"');
    for (const oculto of [
      'telefono',
      'correo',
      'rfc',
      'saldo_pendiente_centavos',
      'limite_credito_centavos',
    ]) {
      expect(sql, oculto).not.toContain(`as "${oculto}"`);
    }
  });

  it('la recepción sigue leyendo a todas las clientas, con su teléfono', async () => {
    await consultar(
      { organizacionId: SALON, rol: 'cajero', empleoId: KARLA },
      { entidad: 'Cliente', operacion: 'list' },
    );
    const sql = consultas[0]?.sql ?? '';
    expect(sql).not.toMatch(/from "cita_servicios"/);
    expect(sql).toContain('as "telefono"');
  });

  it('el mesero de un restaurante no tiene profesional: cero clientas, no todas', async () => {
    await consultar(
      { organizacionId: SALON, rol: 'mesero', empleoId: KARLA },
      { entidad: 'Cliente', operacion: 'list' },
    );
    // La subconsulta va por el empleo: sin profesional ligada, no empareja ninguna fila.
    expect(consultas[0]?.sql).toMatch(/"empleo_id" = \$\d+/);
  });
});

/**
 * UN CAMPO QUE NO SE VE TAMPOCO SE PREGUNTA (cierre de la 2.4).
 *
 * El puente quitaba del `select` lo que un rol no podía ver, pero aceptaba FILTRAR y
 * ORDENAR por ello: «¿hay una clienta con este teléfono?» contestaba con una fila aunque el
 * teléfono no saliera. Ahora se contesta como si el campo no existiera.
 */
describe('filtrar u ordenar por lo que no se ve', () => {
  it('la estilista no puede filtrar clientas por teléfono', async () => {
    await expect(
      consultar(
        { organizacionId: SALON, rol: 'mesero', empleoId: KARLA },
        { entidad: 'Cliente', operacion: 'filter', filtro: { telefono: '5512345678' } },
      ),
    ).rejects.toThrow(/no es un campo de Cliente/);
    expect(consultas).toHaveLength(0);
  });

  it('ni ordenarlas por su saldo', async () => {
    await expect(
      consultar(
        { organizacionId: SALON, rol: 'mesero', empleoId: KARLA },
        { entidad: 'Cliente', operacion: 'list', orden: '-saldo_pendiente_centavos' },
      ),
    ).rejects.toThrow(/No se puede ordenar por/);
  });

  it('quien sí lo ve, filtra por él', async () => {
    await consultar(
      { organizacionId: SALON, rol: 'cajero', empleoId: KARLA },
      { entidad: 'Cliente', operacion: 'filter', filtro: { telefono: '5512345678' } },
    );
    expect(consultas[0]?.parameters).toContain('5512345678');
  });
});
