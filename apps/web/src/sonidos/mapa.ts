/**
 * EL MAPA DE SONIDOS (DP-11.3): qué suena en cada momento del POS. Un evento, un sonido de la
 * biblioteca de React Bits · Sound Lab; Miguel lo aprueba oyéndolo en Configuración → Sonidos.
 *
 * Los que Miguel escogió: Felt, Nib, Pebble, Bead, Notch, Halo y Boop. «Block» no existe en la
 * biblioteca: para el teclado se ofrecen Nib (el de omisión), Keycap, Thock y Clasp, y el
 * negocio elige.
 */
export const RECETAS = [
  'arrive',
  'bead',
  'boop',
  'check',
  'clasp',
  'confetti',
  'dawn',
  'dispatch',
  'dusk',
  'felt',
  'fold',
  'halo',
  'hint',
  'keycap',
  'nib',
  'notch',
  'pebble',
  'ping',
  'popover',
  'receipt',
  'retreat',
  'shrug',
  'signal',
  'thock',
  'unclasp',
] as const;

export type NombreDeReceta = (typeof RECETAS)[number];

/** Los sonidos que se pueden elegir para el teclado de PIN y numérico. */
export const TECLAS_A_ELEGIR = ['nib', 'keycap', 'thock', 'clasp'] as const;
export type SonidoDeTecla = (typeof TECLAS_A_ELEGIR)[number];
export const TECLA_DE_OMISION: SonidoDeTecla = 'nib';

export type EventoDeSonido =
  | 'toque'
  | 'tecla'
  | 'agregar'
  | 'cantidad'
  | 'quitar'
  | 'seccion'
  | 'abrir'
  | 'cerrar'
  | 'encender'
  | 'apagar'
  | 'enviarACocina'
  | 'comandaNueva'
  | 'comandaLista'
  | 'solicitud'
  | 'solicitudAtendida'
  | 'cobro'
  | 'ticket'
  | 'error'
  | 'aviso'
  | 'meta'
  | 'dormir'
  | 'despertar'
  | 'entrar'
  | 'salir';

export interface SonidoDelEvento {
  /** Cómo se llama el momento, para la página de Sonidos. */
  readonly titulo: string;
  readonly receta: NombreDeReceta;
  /** Si todavía no suena en el sistema, por qué (Miguel decide al aprobar el mapa). */
  readonly nota?: string;
}

/** El orden es el de la página de Sonidos: del toque de todos los días a lo que pasa poco. */
export const MAPA: Readonly<Record<EventoDeSonido, SonidoDelEvento>> = {
  toque: { titulo: 'Toque de botón', receta: 'felt' },
  tecla: { titulo: 'Teclado de PIN y numérico', receta: TECLA_DE_OMISION },
  agregar: { titulo: 'Agregar platillo a la cuenta', receta: 'pebble' },
  cantidad: { titulo: 'Cambiar la cantidad de un platillo', receta: 'bead' },
  quitar: { titulo: 'Quitar platillo', receta: 'fold' },
  seccion: { titulo: 'Cambiar de sección, pestaña o zona', receta: 'notch' },
  abrir: { titulo: 'Abrir un diálogo o cajón', receta: 'popover' },
  cerrar: { titulo: 'Cerrar un diálogo o cajón', receta: 'fold' },
  encender: { titulo: 'Interruptor encendido', receta: 'clasp' },
  apagar: { titulo: 'Interruptor apagado', receta: 'unclasp' },
  enviarACocina: { titulo: 'Enviar a cocina', receta: 'dispatch' },
  comandaNueva: {
    titulo: 'Comanda nueva (antes de la voz)',
    receta: 'ping',
    nota: 'Hoy Cocina conserva su timbre y su voz de siempre.',
  },
  comandaLista: { titulo: 'Comanda lista', receta: 'check' },
  solicitud: {
    titulo: 'Solicitud del comensal',
    receta: 'signal',
    nota: 'Hoy suena la alerta del mesero de siempre, con su voz.',
  },
  solicitudAtendida: { titulo: 'Solicitud atendida', receta: 'boop' },
  cobro: { titulo: 'Cobro hecho', receta: 'halo' },
  ticket: { titulo: 'Ticket impreso o enviado', receta: 'receipt' },
  error: { titulo: 'Error', receta: 'shrug' },
  aviso: { titulo: 'Aviso', receta: 'hint' },
  meta: {
    titulo: 'Meta del día',
    receta: 'confetti',
    nota: 'El sistema todavía no tiene meta del día.',
  },
  dormir: { titulo: 'Entrar al modo espera', receta: 'dusk' },
  despertar: { titulo: 'Despertar del modo espera', receta: 'dawn' },
  entrar: { titulo: 'Entrar con PIN', receta: 'arrive' },
  salir: { titulo: 'Salir', receta: 'retreat' },
};

export const EVENTOS = Object.keys(MAPA) as readonly EventoDeSonido[];

/** La receta de un evento, con el sonido de teclado que eligió el negocio. */
export function recetaDe(evento: EventoDeSonido, tecla: SonidoDeTecla): NombreDeReceta {
  return evento === 'tecla' ? tecla : MAPA[evento].receta;
}

export function esEventoDeSonido(valor: string): valor is EventoDeSonido {
  return Object.hasOwn(MAPA, valor);
}
