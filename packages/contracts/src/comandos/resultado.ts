/**
 * El resultado de un comando: una unión, no una excepción.
 *
 * `comando()` **no lanza** por un fallo de negocio. Devuelve `{ ok: false }` con
 * un código estable. La razón no es estética:
 *
 *   · Un `throw` obliga a cada ruta a un `try/catch`, y un `catch` es donde se
 *     silencian los errores que R12 prohíbe silenciar.
 *   · El código estable es lo que la interfaz traduce, lo que la auditoría
 *     cuenta y lo que una prueba afirma. `new Error('no se pudo cobrar')` no
 *     sirve para ninguna de las tres.
 *
 * Un fallo de infraestructura —la base no responde— sí es una excepción, y el
 * envoltorio la convierte en `ERROR_INTERNO` sin filtrar el mensaje de Postgres
 * al cliente. Filtrarlo revela nombres de tablas y de índices.
 */

/** Códigos de fallo de un comando, con el estado HTTP que les corresponde. */
export const CODIGOS_COMANDO = {
  /** La entrada no pasó el esquema. 400. */
  ENTRADA_INVALIDA: 'ENTRADA_INVALIDA',
  /** No hay sesión. 401. */
  NO_AUTENTICADO: 'NO_AUTENTICADO',
  /** El rol del actor no tiene el permiso. 403. */
  SIN_PERMISO: 'SIN_PERMISO',
  /** El paquete de la organización no incluye este comando (A-42). 403. */
  PAQUETE_NO_INCLUYE: 'PAQUETE_NO_INCLUYE',
  /** El comando exige clave de idempotencia y no llegó. 400. */
  IDEMPOTENCIA_REQUERIDA: 'IDEMPOTENCIA_REQUERIDA',
  /** Misma clave, entrada distinta: es un error del cliente, no un reintento. 409. */
  IDEMPOTENCIA_CONFLICTO: 'IDEMPOTENCIA_CONFLICTO',
  /** Otra ejecución con la misma clave sigue abierta. 409. */
  COMANDO_EN_CURSO: 'COMANDO_EN_CURSO',
  /** El recurso no existe — o es de otra organización, que se ve igual. 404. */
  NO_ENCONTRADO: 'NO_ENCONTRADO',
  /** Transición de estado no permitida, o restricción de exclusión. 409. */
  CONFLICTO_ESTADO: 'CONFLICTO_ESTADO',
  /** Regla de negocio violada. 422. */
  REGLA_DE_NEGOCIO: 'REGLA_DE_NEGOCIO',
  /** Cualquier cosa inesperada. 500, sin detalle: sólo el correlation id. */
  ERROR_INTERNO: 'ERROR_INTERNO',
} as const;

export type CodigoComando = (typeof CODIGOS_COMANDO)[keyof typeof CODIGOS_COMANDO];

/** Estado HTTP de cada código. Vive aquí para que la ruta no lo reinvente. */
export const ESTADO_HTTP: Readonly<Record<CodigoComando, number>> = {
  ENTRADA_INVALIDA: 400,
  NO_AUTENTICADO: 401,
  SIN_PERMISO: 403,
  PAQUETE_NO_INCLUYE: 403,
  IDEMPOTENCIA_REQUERIDA: 400,
  IDEMPOTENCIA_CONFLICTO: 409,
  COMANDO_EN_CURSO: 409,
  NO_ENCONTRADO: 404,
  CONFLICTO_ESTADO: 409,
  REGLA_DE_NEGOCIO: 422,
  ERROR_INTERNO: 500,
};

/** Detalle de un campo que no pasó la validación. Nunca incluye el valor. */
export interface ProblemaDeCampo {
  readonly ruta: string;
  readonly problema: string;
}

export interface ErrorComando {
  readonly codigo: CodigoComando;
  /** Para la persona que está en la caja: en español, sin jerga de Postgres. */
  readonly mensaje: string;
  /** Carga útil tipada del fallo. Nunca lleva secretos ni datos de cliente. */
  readonly datos?: Readonly<Record<string, string | number | boolean | null>>;
  /** Sólo en `ENTRADA_INVALIDA`: qué campo y por qué. Sin el valor recibido. */
  readonly problemas?: readonly ProblemaDeCampo[];
}

export type Resultado<T> =
  | {
      readonly ok: true;
      readonly datos: T;
      readonly correlationId: string;
      /** `true` si esta respuesta salió de la tabla de idempotencia, no de ejecutar. */
      readonly reintento: boolean;
    }
  | {
      readonly ok: false;
      readonly error: ErrorComando;
      readonly correlationId: string;
    };
