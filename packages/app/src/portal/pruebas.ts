import type { Transaccion } from '@morphiqpos/data';

import type { AmbitoPortal } from './ambito.ts';
import { banderasDe, type BanderasPortal } from './banderas.ts';
import type { ContextoPortal } from './definicion-publica.ts';

/**
 * La transacción FALSA del portal, para poder afirmar cómo se escribe.
 *
 * ── Por qué hace falta ────────────────────────────────────────────────────
 * Las cuatro escrituras de este módulo se defienden con un `where` y con la
 * cuenta de filas afectadas. Las dos cosas son invisibles desde fuera: una
 * escritura sin guarda y otra con guarda devuelven lo mismo cuando no hay
 * carrera. La única forma de afirmar que la guarda EXISTE —y de que la prueba
 * falle si alguien la quita— es mirar la consulta que se construyó y poder
 * decidir cuántas filas contesta la base.
 *
 * Es el mismo doble que `catalogo/pruebas.ts` ya usa, con dos diferencias que
 * este módulo necesita: las respuestas van por TABLA (una lectura y una
 * escritura sobre `ordenes` se sirven en el orden en que ocurren) y un `update`
 * sin respuesta declarada contesta «una fila», que es el caso normal.
 *
 * NO prueba que Postgres respete el `where`: eso lo prueba Postgres. Prueba que
 * el `where` se manda, que es lo que faltaba.
 */

export interface FiltroFalso {
  readonly columna: string;
  readonly operador: string;
  readonly valor: unknown;
}

export interface OperacionFalsa {
  readonly tipo: 'select' | 'insert' | 'update' | 'delete';
  readonly tabla: string;
  /** Lo que llevaba el `set` o el `values`: un objeto, o un arreglo de filas. */
  valores: unknown;
  readonly filtros: FiltroFalso[];
}

/** Respuestas por tabla, consumidas EN ORDEN por cada consulta a esa tabla. */
export type RespuestasFalsas = Readonly<Record<string, readonly unknown[]>>;

/** Lo que Kysely devuelve de un `update` que encontró su fila. */
export const UNA_FILA = { numUpdatedRows: 1n };
/** Lo que devuelve cuando la guarda del `where` no dejó ninguna. */
export const CERO_FILAS = { numUpdatedRows: 0n };

class ConsultaFalsa {
  constructor(
    private readonly operacion: OperacionFalsa,
    private readonly cola: unknown[],
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

  select(): this {
    return this;
  }

  leftJoin(): this {
    return this;
  }

  orderBy(): this {
    return this;
  }

  limit(): this {
    return this;
  }

  returning(): this {
    return this;
  }

  onConflict(): this {
    return this;
  }

  execute(): Promise<readonly unknown[]> {
    const respuesta = this.cola.shift();
    return Promise.resolve(Array.isArray(respuesta) ? (respuesta as unknown[]) : []);
  }

  executeTakeFirst(): Promise<unknown> {
    return Promise.resolve(this.cola.shift() ?? this.porOmision());
  }

  executeTakeFirstOrThrow(): Promise<unknown> {
    const respuesta = this.cola.shift();
    return respuesta === undefined
      ? Promise.reject(
          new Error(`La consulta falsa a "${this.operacion.tabla}" no tiene respuesta.`),
        )
      : Promise.resolve(respuesta);
  }

  /** Una escritura sin respuesta declarada encontró su fila; una lectura, nada. */
  private porOmision(): unknown {
    const escribe = this.operacion.tipo === 'update' || this.operacion.tipo === 'delete';
    return escribe ? UNA_FILA : undefined;
  }
}

export interface BaseFalsa {
  readonly tx: Transaccion;
  readonly operaciones: OperacionFalsa[];
  /** La última escritura sobre esa tabla, que es casi siempre la que se afirma. */
  escrituraEn(tabla: string): OperacionFalsa | undefined;
}

export function transaccionFalsa(respuestas: RespuestasFalsas = {}): BaseFalsa {
  const operaciones: OperacionFalsa[] = [];
  const colas = new Map<string, unknown[]>(
    Object.entries(respuestas).map(([tabla, filas]) => [tabla, [...filas]]),
  );

  const consulta = (tipo: OperacionFalsa['tipo'], tabla: string): ConsultaFalsa => {
    const operacion: OperacionFalsa = { tipo, tabla, valores: undefined, filtros: [] };
    operaciones.push(operacion);
    let cola = colas.get(tabla);
    if (cola === undefined) {
      cola = [];
      colas.set(tabla, cola);
    }
    return new ConsultaFalsa(operacion, cola);
  };

  // El cambio de tipo está acotado a esta línea, igual que en
  // `catalogo/pruebas.ts:86`: el doble no implementa Kysely, implementa las
  // cuatro entradas que el portal usa. Ver la cabecera del archivo.
  const tx = {
    selectFrom: (tabla: string) => consulta('select', tabla),
    insertInto: (tabla: string) => consulta('insert', tabla),
    updateTable: (tabla: string) => consulta('update', tabla),
    deleteFrom: (tabla: string) => consulta('delete', tabla),
  } as unknown as Transaccion;

  return {
    tx,
    operaciones,
    escrituraEn(tabla) {
      return [...operaciones]
        .reverse()
        .find((o) => o.tabla === tabla && (o.tipo === 'update' || o.tipo === 'insert'));
    },
  };
}

/** Lo que escribió un `set` o un `values` de una sola fila. */
export function valoresDe(
  operacion: OperacionFalsa | undefined,
): Readonly<Record<string, unknown>> {
  const valores = operacion?.valores;
  if (typeof valores !== 'object' || valores === null || Array.isArray(valores)) {
    throw new Error('Esa operación no escribió una fila.');
  }
  return valores as Readonly<Record<string, unknown>>;
}

/** Las filas de un `values` múltiple: la pregunta del N+1. */
export function filasDe(operacion: OperacionFalsa | undefined): readonly unknown[] {
  const valores = operacion?.valores;
  if (!Array.isArray(valores)) throw new Error('Esa operación no insertó un lote de filas.');
  return valores as readonly unknown[];
}

/** ¿Lleva la consulta este filtro? Es la pregunta de la guarda de estado. */
export function tieneFiltro(operacion: OperacionFalsa | undefined, columna: string): boolean {
  return operacion?.filtros.some((f) => f.columna === columna) ?? false;
}

/** El filtro sobre esa columna, para poder afirmar el operador y los valores. */
export function filtroDe(operacion: OperacionFalsa | undefined, columna: string): FiltroFalso {
  const filtro = operacion?.filtros.find((f) => f.columna === columna);
  if (filtro === undefined) {
    throw new Error(`La consulta no filtra por "${columna}": la guarda no está en el where.`);
  }
  return filtro;
}

export const ORG_FALSA = '11111111-1111-4111-8111-111111111111';
export const SUCURSAL_FALSA = '22222222-2222-4222-8222-222222222222';
export const MESA_FALSA = '33333333-3333-4333-8333-333333333333';

export function ambitoFalso(cambios: Partial<AmbitoPortal> = {}): AmbitoPortal {
  return {
    organizacionId: ORG_FALSA,
    sucursalId: SUCURSAL_FALSA,
    mesaId: MESA_FALSA,
    mesaNumero: 5,
    mesaNombre: 'Terraza 5',
    tokenMesa: 'mabc123xyz',
    estadoMesa: 'ocupada',
    ordenActivaId: null,
    empleadoAsignadoId: 'empleo-1',
    ...cambios,
  };
}

export interface ContextoFalso {
  readonly ctx: ContextoPortal;
  readonly base: BaseFalsa;
  readonly auditorias: { entidadId: string | null; payload: Record<string, unknown> }[];
}

/** Un `ContextoPortal` completo sobre la transacción falsa. */
export function contextoPortalFalso(
  respuestas: RespuestasFalsas = {},
  banderas: BanderasPortal = banderasDe({ portal_qr_activo: true }),
): ContextoFalso {
  const base = transaccionFalsa(respuestas);
  const auditorias: { entidadId: string | null; payload: Record<string, unknown> }[] = [];

  return {
    base,
    auditorias,
    ctx: {
      ambito: ambitoFalso(),
      banderas,
      paquete: 'restaurante',
      correlationId: '44444444-4444-4444-8444-444444444444',
      ahora: new Date('2026-09-09T20:00:00Z'),
      tx: base.tx,
      paso: async (_nombre, ejecutar) => ejecutar(),
      auditar: (datos) => auditorias.push(datos),
    },
  };
}
