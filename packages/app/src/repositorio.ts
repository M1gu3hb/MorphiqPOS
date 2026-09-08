import type { Paquete } from '@morphiqpos/contracts';

/**
 * Lo único que el envoltorio necesita de la base.
 *
 * Está parametrizado sobre el tipo de transacción a propósito. El envoltorio no
 * hace nada con `tx` salvo pasarlo: al cuerpo del comando y a estas cinco
 * funciones. No saber qué es una transacción es lo que permite enlazarlo a la
 * `Transaccion` real de Kysely en producción y a un doble en las pruebas, sin
 * simular Kysely y sin un solo `any`.
 *
 * No es un puerto «por si acaso»: es la frontera que `04-ARQUITECTURA §2` ya
 * exige entre `app` y `data`.
 */

export interface DatosReclamacion {
  readonly organizacionId: string;
  readonly comando: string;
  readonly idempotencyKey: string;
  readonly huellaEntrada: string;
  readonly identidadId: string;
  readonly correlationId: string;
}

export interface EjecucionGuardada {
  readonly organizacionId: string;
  readonly comando: string;
  readonly idempotencyKey: string;
  readonly huellaEntrada: string;
  readonly respuesta: unknown;
  readonly reintentos: number;
}

/**
 * Resultado de intentar reclamar una clave de idempotencia.
 *
 * · `reclamada` — es la primera ejecución; sigue adelante.
 * · `duplicada` — ya existe una fila CONFIRMADA con esa clave.
 * · `ocupada`   — otra transacción la tiene tomada y no ha confirmado todavía.
 */
export type Reclamacion = 'reclamada' | 'duplicada' | 'ocupada';

export interface FilaAuditoria {
  readonly organizacionId: string;
  readonly identidadId: string | null;
  readonly terminalId: string | null;
  readonly accion: string;
  readonly entidad: string;
  readonly entidadId: string | null;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly correlationId: string;
}

export interface RepositorioComandos<TX> {
  /** El paquete contratado por la organización (A-42). `null` si no se pudo leer. */
  leerPaquete(tx: TX, organizacionId: string): Promise<Paquete | null>;

  /** Reclama la clave DENTRO de la transacción del comando. */
  reclamarClave(tx: TX, datos: DatosReclamacion): Promise<Reclamacion>;

  /**
   * Lee una ejecución ya CONFIRMADA por otra transacción.
   *
   * Recibe la transacción en curso a propósito. Con `read committed`, leer desde
   * ella ve igual las filas que otras transacciones ya confirmaron, y evita
   * tomar una segunda conexión del pool mientras se sostiene la primera —que a
   * suficiente concurrencia es como se agota el pool y se cuelga la caja.
   */
  leerEjecucion(
    tx: TX,
    organizacionId: string,
    comando: string,
    idempotencyKey: string,
  ): Promise<EjecucionGuardada | null>;

  /** Guarda la respuesta en la fila reclamada, antes de confirmar. */
  completarEjecucion(
    tx: TX,
    datos: {
      readonly organizacionId: string;
      readonly comando: string;
      readonly idempotencyKey: string;
      readonly respuesta: unknown;
      readonly ahora: Date;
    },
  ): Promise<void>;

  /** Cuenta un reintento servido desde la tabla. No vuelve a ejecutar nada. */
  registrarReintento(
    organizacionId: string,
    comando: string,
    idempotencyKey: string,
  ): Promise<void>;

  /**
   * Escribe una fila de auditoría.
   *
   * Con `tx` va dentro de la transacción del comando: es el rastro de un éxito,
   * y si el cobro se revierte su rastro se revierte con él.
   *
   * Con `tx === null` va en una transacción propia: es el rastro de un rechazo,
   * y tiene que sobrevivir precisamente a la reversión que lo causó.
   */
  escribirAuditoria(tx: TX | null, fila: FilaAuditoria): Promise<void>;
}
