import 'server-only';

export interface EventoRegistroDatos {
  readonly nivel: 'error' | 'alerta';
  readonly modulo: string;
  readonly correlationId: string;
  readonly organizacionId: string | null;
  readonly mensaje: string;
}

/** Emite contexto seguro y nunca serializa el error de Postgres. */
export function registrar(evento: EventoRegistroDatos): void {
  console.error(JSON.stringify(evento));
}
