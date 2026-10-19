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
import { ROLES, ROLES_CONSOLIDADOS } from '@morphiqpos/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * LA FRONTERA POR SUCURSAL DEL PUENTE (D-36).
 *
 * El dueño y el administrador leen el negocio entero; el resto de los roles, SU sucursal:
 * la de su terminal o la de su empleo, que pone `resolverSesion` y nunca el cliente. Esto
 * corre `consultar` —el lector REAL— sobre una conexión que apunta cada consulta, y afirma
 * la forma de la frontera de cada clase de entidad:
 *
 *   · con columna propia (`ordenes.sucursal_id`), la igualdad;
 *   · con columna que admite nulo para «del negocio» (`profesionales`), el `coalesce`;
 *   · sin columna, por su padre (`orden_lineas` → `ordenes`), la subconsulta acotada
 *     también por organización;
 *   · del negocio entero (el catálogo), nada.
 *
 * Y que falla CERRADA: sin sucursal en el ámbito, quien no consolida no lee nada que sea
 * de una. Vista en ROJO sin el paso 1c de `consultar.ts`.
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
const { MAPA, entidadMapeada } = await import('./mapa.ts');

const NEGOCIO = '7a1f3c55-0b8e-4c43-9a51-2f6d8e1b4c01';
const CENTRO = '7a1f3c55-0b8e-4c43-9a51-2f6d8e1b4c02';
const EMPLEO = '7a1f3c55-0b8e-4c43-9a51-2f6d8e1b4c03';
const VENTA = '7a1f3c55-0b8e-4c43-9a51-2f6d8e1b4c04';
const NINGUNA = '00000000-0000-4000-8000-000000000000';

function ambito(rol: string, sucursalId: string | null = CENTRO) {
  return { organizacionId: NEGOCIO, rol, empleoId: EMPLEO, sucursalId };
}

beforeEach(() => {
  consultas.length = 0;
});

describe('la frontera por sucursal del puente (D-36)', () => {
  it('sólo el dueño y el administrador consolidan', () => {
    expect([...ROLES_CONSOLIDADOS]).toEqual(['dueno', 'administrador']);
    expect(ROLES.filter((r) => !(ROLES_CONSOLIDADOS as readonly string[]).includes(r))).toEqual([
      'gerente',
      'cajero',
      'mesero',
      'cocina',
      'almacen',
    ]);
  });

  it.each(['gerente', 'cajero', 'mesero', 'cocina'])(
    '%s lee las ventas de SU sucursal y de ninguna otra',
    async (rol) => {
      await consultar(ambito(rol), { entidad: 'Venta', operacion: 'list' });
      const principal = consultas[0];
      expect(principal?.sql).toMatch(/"b"\."sucursal_id" = \$\d+/);
      expect(principal?.parameters).toContain(CENTRO);
    },
  );

  it.each([...ROLES_CONSOLIDADOS])('%s lee las ventas de todas las sucursales', async (rol) => {
    // Aunque la sesión traiga sucursal: el dueño en la terminal del centro sigue siendo el
    // dueño del negocio entero.
    await consultar(ambito(rol), { entidad: 'Venta', operacion: 'list' });
    expect(consultas[0]?.sql).not.toMatch(/sucursal_id/);
    expect(consultas[0]?.parameters).not.toContain(CENTRO);
  });

  it('sin sucursal en el ámbito, quien no consolida no lee NADA de una sucursal', async () => {
    await consultar(ambito('gerente', null), { entidad: 'Venta', operacion: 'list' });
    expect(consultas[0]?.sql).toMatch(/"b"\."sucursal_id" = \$\d+/);
    expect(consultas[0]?.parameters).toContain(NINGUNA);
    expect(consultas[0]?.parameters).not.toContain(CENTRO);
  });

  it('pedir por id no salta la frontera: el id Y la sucursal', async () => {
    await consultar(ambito('cajero'), { entidad: 'Venta', operacion: 'get', id: VENTA });
    expect(consultas[0]?.sql).toMatch(/"b"\."sucursal_id" = \$\d+/);
    expect(consultas[0]?.sql).toMatch(/"b"\."id" = \$\d+/);
    expect(consultas[0]?.parameters).toEqual(expect.arrayContaining([CENTRO, VENTA]));
  });

  it('lo que admite nulo para «del negocio» se lee con su coalesce', async () => {
    await consultar(ambito('gerente'), { entidad: 'Profesional', operacion: 'list' });
    expect(consultas[0]?.sql).toMatch(/coalesce\("b"\."sucursal_id", \$\d+::uuid\) = \$\d+/);
    expect(consultas[0]?.parameters).toContain(CENTRO);
  });

  it('lo que no tiene columna se acota por su padre, y el padre por organización', async () => {
    await consultar(ambito('gerente'), { entidad: 'DetalleVenta', operacion: 'list' });
    const sql = consultas[0]?.sql ?? '';
    expect(sql).toMatch(/"b"\."orden_id" in \(select "id" from "ordenes"/);
    expect(sql).toMatch(/"organizacion_id" = \$\d+ and "sucursal_id" = \$\d+/);
    expect(consultas[0]?.parameters).toEqual(expect.arrayContaining([NEGOCIO, CENTRO]));
  });

  it('el padre que admite nulo también se lee con su coalesce', async () => {
    await consultar(ambito('gerente'), { entidad: 'ComisionCausada', operacion: 'list' });
    const sql = consultas[0]?.sql ?? '';
    expect(sql).toMatch(/"b"\."profesional_id" in \(select "id" from "profesionales"/);
    expect(sql).toMatch(/coalesce\("sucursal_id", \$\d+::uuid\) = \$\d+/);
  });

  it('lo que es del negocio entero —el catálogo— no lleva frontera', async () => {
    await consultar(ambito('cajero'), { entidad: 'ProductoTerminado', operacion: 'list' });
    expect(consultas[0]?.sql).not.toMatch(/sucursal_id/);
  });

  it('cada entidad declara su frontera, y la del negocio entero dice por qué', () => {
    const nombres = [...Object.keys(MAPA), 'DescuentoInventarioVenta'];
    for (const nombre of nombres) {
      const frontera = entidadMapeada(nombre)?.sucursal;
      expect(frontera, nombre).toBeDefined();
      if (frontera !== undefined && 'delNegocio' in frontera) {
        expect(frontera.delNegocio.length, nombre).toBeGreaterThan(40);
      }
    }
  });
});
