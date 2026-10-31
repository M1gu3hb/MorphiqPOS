import type { EventoDeSonido, NombreDeReceta } from './mapa';

/** El portal del comensal: lo que se abre al leer el QR de la mesa. */
const RUTA_DEL_PORTAL = '/qr/';

/** El portal del comensal calla, salvo que el negocio le haya dado sonidos. */
export function silencioDelPortal(ruta: string, sonidosEnElPortal: boolean): boolean {
  return ruta.startsWith(RUTA_DEL_PORTAL) && !sonidosEnElPortal;
}

/**
 * Un sonido de ACCIÓN (cobrar, enviar a cocina, agregar…) calla por un momento a los de su
 * alrededor: el diálogo que esa acción cierra o abre y el toque genérico. Un toque, un sonido.
 */
export const VENTANA_DE_LA_ACCION_MS = 400;

const ACCIONES: ReadonlySet<EventoDeSonido> = new Set<EventoDeSonido>([
  'agregar',
  'cantidad',
  'quitar',
  'enviarACocina',
  'comandaLista',
  'solicitudAtendida',
  'cobro',
  'ticket',
]);
const ALREDEDOR: ReadonlySet<EventoDeSonido> = new Set<EventoDeSonido>([
  'toque',
  'abrir',
  'cerrar',
]);

export function esAccion(evento: EventoDeSonido): boolean {
  return ACCIONES.has(evento);
}

/** ¿Lo calla una acción que acaba de sonar? `calladoHasta`: hasta cuándo calla la última. */
export function callaPorUnaAccion(
  evento: EventoDeSonido,
  ahora: number,
  calladoHasta: number,
): boolean {
  return ALREDEDOR.has(evento) && ahora < calladoHasta;
}

/** Un mismo sonido no suena dos veces en menos de esto: nada de ráfagas. */
export const ENTRE_REPETICIONES_MS = 80;

export interface EstadoDelGestor {
  /** El navegador sólo deja sonar después del primer toque. */
  readonly desbloqueado: boolean;
  /** Ganancia del aparato (0 = apagado). */
  readonly ganancia: number;
  /** ¿Hay una voz hablando (Cocina, Solicitudes)? Nunca se le encima un sonido. */
  readonly hablando: boolean;
  /** ¿Es el portal del comensal y el negocio no le dio sonidos? */
  readonly silencioDelPortal: boolean;
  /** Cuándo sonó por última vez cada receta. */
  readonly ultimas: ReadonlyMap<NombreDeReceta, number>;
}

/**
 * ¿Suena esta receta ahora? Lo decide todo aquí, sin tocar Web Audio, para probarlo sin
 * navegador. «Reducir movimiento» no entra: no apaga el sonido; el perfil del aparato sí.
 */
export function debeSonar(estado: EstadoDelGestor, receta: NombreDeReceta, ahora: number): boolean {
  if (!estado.desbloqueado || estado.ganancia <= 0) return false;
  if (estado.hablando || estado.silencioDelPortal) return false;
  const ultima = estado.ultimas.get(receta);
  return ultima === undefined || ahora - ultima >= ENTRE_REPETICIONES_MS;
}
