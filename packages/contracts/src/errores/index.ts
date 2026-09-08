/**
 * Errores tipados del dominio.
 *
 * `04-ARQUITECTURA §3` — "Errores tipados: `ErrorDominio` con codigo estable,
 * nunca strings libres."
 *
 * El codigo es lo que viaja: a la interfaz para traducir el mensaje, a la
 * auditoria para poder contar cuantas veces pasa, y a las pruebas para afirmar
 * *que* fallo y no solo *que* fallo algo. Un `throw new Error('total invalido')`
 * no sirve para ninguna de las tres cosas.
 */

/** Codigos estables. Nunca se renombra uno: se marca obsoleto y se agrega otro. */
export const CODIGOS_ERROR = {
  // --- dinero ---
  /** Se intento construir un importe que no es un entero de centavos. */
  DINERO_NO_ENTERO: 'DINERO_NO_ENTERO',
  /** El texto recibido no representa un importe. */
  DINERO_TEXTO_INVALIDO: 'DINERO_TEXTO_INVALIDO',
  /** Se pidio repartir en un numero de partes que no es un entero positivo. */
  DINERO_PARTES_INVALIDAS: 'DINERO_PARTES_INVALIDAS',
  /** Se pidio un redondeo con divisor cero. */
  DINERO_DIVISOR_CERO: 'DINERO_DIVISOR_CERO',
  /** Los puntos base de un porcentaje no son un entero. */
  DINERO_PORCENTAJE_INVALIDO: 'DINERO_PORCENTAJE_INVALIDO',

  // --- andamiaje de pruebas ---
  /** Se pidio interrumpir despues de un paso que no existe (inyeccion de fallos). */
  PASO_INEXISTENTE: 'PASO_INEXISTENTE',
} as const;

export type CodigoError = (typeof CODIGOS_ERROR)[keyof typeof CODIGOS_ERROR];

/** Datos adicionales del error. Nunca lleva secretos ni datos de cliente (R31). */
export type DetallesError = Readonly<Record<string, string | number | boolean | null>>;

/**
 * Error de una regla de negocio o de una precondicion violada.
 *
 * No se usa para fallos de infraestructura (red caida, disco lleno): esos son
 * excepciones normales y suben tal cual.
 */
export class ErrorDominio extends Error {
  readonly codigo: CodigoError;
  readonly detalles: DetallesError;

  constructor(codigo: CodigoError, mensaje: string, detalles: DetallesError = {}) {
    super(mensaje);
    this.name = 'ErrorDominio';
    this.codigo = codigo;
    this.detalles = detalles;
  }
}

/** Estrecha un `unknown` de un `catch` a `ErrorDominio` (R12). */
export function esErrorDominio(valor: unknown): valor is ErrorDominio {
  return valor instanceof ErrorDominio;
}
