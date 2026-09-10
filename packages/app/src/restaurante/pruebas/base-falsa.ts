import type { Ambito } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';

import type { ContextoComando } from '../../definicion.ts';
import {
  actualizacion,
  borrado,
  insercion,
  lectura,
  origen,
  type Fila,
} from './constructor-falso.ts';

/**
 * Una base de datos de mentira con la forma del constructor de Kysely.
 *
 * Existe porque el veredicto midió los seis comandos de restaurante al 0 % de
 * cobertura: las 48 pruebas anteriores sólo tocaban la tabla de transiciones,
 * el reparto por estación y la FORMA de los esquemas, así que ninguna llegaba a
 * ejecutar una línea de un comando y ninguna podía cazar los dos bloqueantes.
 *
 * Lo que prueba es la LÓGICA de los comandos: qué leen, qué escriben, con qué
 * guardas y en qué orden. Que Postgres cumpla los `check` y los índices únicos
 * es la otra mitad, y ésa vive en las pruebas de integración con `DATABASE_URL`.
 */

export type { Fila } from './constructor-falso.ts';
export type TablasFalsas = Readonly<Record<string, readonly Fila[]>>;

export interface BaseFalsa {
  /** El doble que se le pasa a los comandos como si fuera su transacción. */
  readonly tx: Transaccion;
  /** Las filas vivas de una tabla, para afirmar sobre lo que quedó escrito. */
  filas(tabla: string): readonly Fila[];
  /**
   * El valor de una columna de una fila.
   *
   * Existe porque `Fila` es un índice abierto y el proyecto tiene encendido
   * `noPropertyAccessFromIndexSignature`: sin este accesor, cada afirmación de
   * una prueba se escribiría con corchetes y se leería peor que el SQL que
   * comprueba.
   */
  campo(tabla: string, columna: string, indice?: number): unknown;
}

export interface OpcionesBase {
  /**
   * Lo que devuelve cualquier consulta cruda (`sql\`…\``).
   *
   * `repoFolios.tomarFolio` toma el consecutivo con `UPDATE … RETURNING` en SQL
   * crudo, así que sin esto el cobro no llega al final. `[{ siguiente: 1n }]`
   * es la respuesta de la primera venta de una sucursal.
   */
  readonly filasCrudas?: readonly Fila[];
  /**
   * Las cláusulas `default` de cada tabla, por nombre de tabla.
   *
   * Los comandos omiten a propósito las columnas que la migración rellena sola
   * —`orden_lineas.descuento_centavos` es `default 0`—, así que sin declararlas
   * aquí la fila insertada saldría incompleta y la aritmética de `cotizar`
   * fallaría por una carencia de la base falsa y no del código probado.
   */
  readonly predeterminados?: Readonly<Record<string, Fila>>;
}

export function crearBaseFalsa(datos: TablasFalsas, opciones: OpcionesBase = {}): BaseFalsa {
  const tablas = new Map<string, Fila[]>(
    Object.entries(datos).map(([nombre, filas]) => [nombre, filas.map((f) => ({ ...f }))]),
  );

  const de = (nombre: string): Fila[] => {
    const clave = origen(nombre.split(' as ')[0] ?? nombre);
    const existentes = tablas.get(clave);
    if (existentes !== undefined) return existentes;
    const nuevas: Fila[] = [];
    tablas.set(clave, nuevas);
    return nuevas;
  };

  const ejecutorCrudo = {
    transformQuery: (nodo: unknown) => nodo,
    compileQuery: (nodo: unknown) => nodo,
    executeQuery: async () => ({ rows: [...(opciones.filasCrudas ?? [])] }),
    withPlugins: () => ejecutorCrudo,
  };

  const constructor = {
    getExecutor: () => ejecutorCrudo,
    selectFrom: (tabla: string) => lectura(de(tabla)),
    insertInto: (tabla: string) =>
      insercion(de(tabla), opciones.predeterminados?.[origen(tabla)] ?? {}),
    updateTable: (tabla: string) => actualizacion(de(tabla)),
    deleteFrom: (tabla: string) => borrado(de(tabla)),
  };

  return {
    // EL ÚNICO PUENTE DE TIPOS, y acotado a esta línea. `Transaccion` es
    // `Transaction<Esquema>`, una clase con miembros privados: ningún objeto
    // estructural puede satisfacerla, así que cualquier prueba sin base de
    // datos que ejecute el cuerpo de un comando pasa por aquí. Está en un solo
    // sitio a propósito, igual que el de `pruebas/dobles.ts:192`.
    tx: constructor as unknown as Transaccion,
    filas: (tabla) => de(tabla).map((f) => ({ ...f })),
    campo: (tabla, columna, indice = 0) => de(tabla)[indice]?.[columna] ?? null,
  };
}

export interface EjecucionFalsa {
  readonly ctx: ContextoComando<Transaccion>;
  /** Los pasos que el comando llegó a nombrar, en orden. */
  readonly pasos: readonly string[];
  readonly auditorias: readonly { entidadId: string | null; payload: Record<string, unknown> }[];
}

/** El contexto que recibe el cuerpo de un comando, sin el envoltorio. */
export function contextoFalso(tx: Transaccion, ambito: Ambito, ahora = new Date()): EjecucionFalsa {
  const pasos: string[] = [];
  const auditorias: { entidadId: string | null; payload: Record<string, unknown> }[] = [];

  return {
    pasos,
    auditorias,
    ctx: {
      ambito,
      correlationId: 'correlacion-de-prueba',
      ahora,
      tx,
      async paso(nombre, fn) {
        pasos.push(nombre);
        return fn();
      },
      auditar(datos) {
        auditorias.push(datos);
      },
    },
  };
}
