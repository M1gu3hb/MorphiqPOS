/**
 * LO QUE «CITA EN CURSO» LEE AL ABRIR, sin React y con su prueba (D.1 de la 2.4).
 *
 * ── El defecto que esto arregla ───────────────────────────────────────────────────
 * La pantalla tomaba a la clienta de la DIRECCIÓN (`?clienta=`), y la agenda —que es la
 * única puerta a una cita— sólo manda `?cita=`. Con la clienta en nulo, el puente filtraba
 * `cliente_id is null`: la cabecera decía «Sin registrar», el historial salía vacío y
 * «Repetir igual» nunca aparecía, que es justo la fórmula de la vez pasada (el dolor 3 del
 * giro). La clienta ya viene en la CITA (`cliente_id`): se lee de ahí, y la dirección sólo
 * tiene que decir qué cita.
 *
 * Una walk-in sin ficha no tiene clienta: no se pregunta por nadie, en vez de preguntar
 * por «nadie» y recibir lo de todas las que no tienen ficha.
 */

/** La forma de `consultarPuente` (`~/cliente/api`), lo que aquí se usa. */
export type Consultar = <T>(
  entidad: string,
  opciones: {
    readonly filtro?: Readonly<Record<string, unknown>>;
    readonly orden?: string;
    readonly limite?: number;
    readonly signal?: AbortSignal;
  },
) => Promise<readonly T[]>;

export interface FilaCita {
  readonly id: string;
  readonly agendada_para: string;
  readonly inicio_real: string | null;
  readonly cliente_id?: string | null;
  readonly notas?: string | null;
}

export interface FilaClienta {
  readonly nombre: string;
  /**
   * Opcional a propósito: `Cliente` no sirve las alergias —viven en el expediente— y un
   * `undefined` aquí se leería como «sin alergias».
   */
  readonly alergias?: string | null;
}

export interface VisitaConFormula {
  readonly id: string;
  /** ISO. Se formatea en el cliente: el servidor no sabe la zona del salón. */
  readonly fecha: string;
  readonly servicio: string;
  /**
   * El jsonb congelado, tal cual lo sirve el puente (`conversion: 'json'`): lo que
   * escribe `expediente.capturar_formula`, `{mezclado, usado, sobrante, componentes}`.
   *
   * Los materiales vienen DENTRO, no como campo suelto. Esta pantalla leía
   * `componentes` en la raíz: llegaba `undefined` y «la vez pasada» salía vacía con
   * cualquier clienta que vuelve, y REPETIR guardaba una fórmula sin materiales. Es
   * dato de fuera: se lee con `formulaDe`, que no confía en su forma.
   */
  readonly formula?: unknown;
  /**
   * `minutos_procesado`. NULO si se capturó sin procesado: `capturar_formula` guarda
   * el cero como nulo, y el mismo comando no acepta un nulo de vuelta.
   */
  readonly minutos: number | null;
}

export interface ServicioDeLaCita {
  readonly id: string;
  /** `servicio_nombre`, que es como lo sirve `CitaServicio`. */
  readonly servicio_nombre: string | null;
  /**
   * EN PESOS: el gemelo honesto de `precio_centavos`, la misma columna, que el puente
   * convierte con `dinero`. Aquí se leía `precio_centavos` y se pasaba tal cual a
   * `<Dinero centavos>`: una cita de $350.00 se veía $3.50 (C.1 de la 2.4). Se lee
   * sólo con `centavosDe`.
   */
  readonly precio_pesos: number;
  readonly estado: string;
  /** El producto-servicio: su receta de cabina es el material. */
  readonly servicio_id?: string;
}

export interface LecturaDeLaCita {
  readonly cita: FilaCita | undefined;
  readonly clienta: FilaClienta | undefined;
  readonly lineas: readonly ServicioDeLaCita[];
  /** `null` si el historial no cargó: la captura sigue en pie y se dice. */
  readonly formulas: readonly VisitaConFormula[] | null;
}

export async function leerLaCita(
  consultarPuente: Consultar,
  citaId: string | null,
  signal?: AbortSignal,
): Promise<LecturaDeLaCita> {
  const conSenal = signal === undefined ? {} : { signal };
  const [citas, lineas] = await Promise.all([
    consultarPuente<FilaCita>('Cita', { filtro: { id: citaId }, limite: 1, ...conSenal }),
    consultarPuente<ServicioDeLaCita>('CitaServicio', {
      filtro: { cita_id: citaId },
      limite: 20,
      ...conSenal,
    }),
  ]);
  const cita = citas[0];
  const clienteId = cita?.cliente_id ?? null;
  if (clienteId === null) return { cita, clienta: undefined, lineas, formulas: [] };

  const [clientas, formulas] = await Promise.all([
    consultarPuente<FilaClienta>('Cliente', { filtro: { id: clienteId }, limite: 1, ...conSenal }),
    // El historial se degrada SOLO: si no carga, la captura sigue en pie.
    consultarPuente<VisitaConFormula>('FormulaAplicada', {
      filtro: { cliente_id: clienteId },
      orden: '-fecha',
      limite: 6,
      ...conSenal,
    }).catch(() => null),
  ]);
  return { cita, clienta: clientas[0], lineas, formulas };
}
