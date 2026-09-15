import 'server-only';

export type NivelRegistro = 'error' | 'alerta';

export interface EventoRegistro {
  readonly nivel: NivelRegistro;
  readonly modulo: string;
  readonly correlationId: string;
  readonly organizacionId: string | null;
  readonly mensaje: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Conserva una correlacion confiable o crea otra; nunca registra texto del cliente. */
export function correlationIdDe(candidato: string | null | undefined): string {
  return candidato !== null && candidato !== undefined && UUID.test(candidato)
    ? candidato
    : crypto.randomUUID();
}

/**
 * Emite exactamente una linea JSON para que el colector pueda buscar y alertar.
 *
 * El mensaje lo decide cada llamador y no se serializa la excepcion: los errores
 * de Postgres pueden contener valores de entrada, nombres internos o secretos.
 */
export function registrar(evento: EventoRegistro): void {
  console.error(JSON.stringify(evento));
}
