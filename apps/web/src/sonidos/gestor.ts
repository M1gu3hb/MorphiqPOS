import {
  TECLA_DE_OMISION,
  recetaDe,
  type EventoDeSonido,
  type NombreDeReceta,
  type SonidoDeTecla,
} from './mapa';
import {
  VENTANA_DE_LA_ACCION_MS,
  callaPorUnaAccion,
  debeSonar,
  esAccion,
} from './reglas-del-gestor';
import { desbloquearAudio, precargar, reproducir } from './reproductor';

/**
 * EL GESTOR DE SONIDO (DP-11.3): el único lugar por donde suena la interfaz. Cualquiera llama a
 * `sonar(evento)` —una pantalla nueva o una heredada— y aquí se decide: el perfil del aparato, el
 * primer toque que exige el navegador, la voz de Cocina o de Solicitudes (nunca se le encima),
 * el portal del comensal y el límite de repetición.
 *
 * Es un almacén de módulo, como el despertador del modo espera: una pestaña, un gestor. Lo
 * configura `ProveedorDeSonidos` con lo del aparato y lo del negocio.
 */
export interface ConfiguracionDeSonido {
  /** Ganancia del aparato, de 0 (apagado) a 1. */
  readonly ganancia: number;
  /** El sonido del teclado que eligió el negocio. */
  readonly tecla: SonidoDeTecla;
  /** En el portal del comensal y sin sonidos para él: silencio. */
  readonly silencioDelPortal: boolean;
}

let configuracion: ConfiguracionDeSonido = {
  ganancia: 0,
  tecla: TECLA_DE_OMISION,
  silencioDelPortal: false,
};
let desbloqueado = false;
const ultimas = new Map<NombreDeReceta, number>();
const escuchasDelFallo = new Set<() => void>();
let fallo: string | null = null;

export function configurarSonidos(nueva: ConfiguracionDeSonido): void {
  configuracion = nueva;
}

/** Lo llama el primer toque de la pestaña: desde ahí el navegador deja sonar. */
export function desbloquearSonidos(): void {
  // En CADA gesto, no sólo el primero: iOS deja el audio «interrumpido» al bloquear la pantalla
  // o cambiar de app, y sólo se reanuda dentro de un gesto.
  try {
    desbloquearAudio().catch(anotarFallo);
  } catch (error: unknown) {
    anotarFallo(error);
  }
  if (desbloqueado) return;
  desbloqueado = true;
  // Lo que más suena y lo que va antes de recargar (entrar, salir), ya sintetizado. Si este
  // aparato no suena (Apagado, el portal callado), no se gasta en nada.
  if (configuracion.ganancia <= 0 || configuracion.silencioDelPortal) return;
  for (const receta of ['felt', configuracion.tecla, 'arrive', 'retreat'] as const)
    void precargar(receta).catch(anotarFallo);
}

/** La voz de Cocina y de Solicitudes es Web Speech: lo público es `speaking` y `pending`. */
function hayVozHablando(): boolean {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return false;
  return window.speechSynthesis.speaking || window.speechSynthesis.pending;
}

function anotarFallo(error: unknown): void {
  fallo = error instanceof Error ? error.message : 'El navegador no dejó reproducir el sonido.';
  for (const escucha of escuchasDelFallo) escucha();
}

/** Un sonido que sí salió: el aviso de un fallo anterior ya no vale. */
function quitarElFallo(): void {
  if (fallo === null) return;
  fallo = null;
  for (const escucha of escuchasDelFallo) escucha();
}

let calladoHasta = 0;

/**
 * El toque genérico espera un instante: si en ese instante suena algo más preciso (el diálogo que
 * ese toque abrió, el platillo que agregó), el toque se calla. Un toque, un sonido.
 */
export const ESPERA_DEL_TOQUE_MS = 40;
let toquePendiente: ReturnType<typeof setTimeout> | null = null;

/** El momento pasó: si toca, suena. Nunca lanza. */
export function sonar(evento: EventoDeSonido): void {
  if (evento === 'toque') {
    toquePendiente ??= setTimeout(() => {
      toquePendiente = null;
      tocar('toque');
    }, ESPERA_DEL_TOQUE_MS);
    return;
  }
  if (toquePendiente !== null) {
    clearTimeout(toquePendiente);
    toquePendiente = null;
  }
  tocar(evento);
}

/**
 * Lo que sonó la última vez queda escrito en el documento (`data-ultimo-sonido`): las pruebas del
 * navegador lo leen sin depender de la tarjeta de audio, como `data-espera-decision`.
 */
function anotarLoQueSono(receta: NombreDeReceta): void {
  if (typeof document !== 'undefined')
    document.documentElement.setAttribute('data-ultimo-sonido', receta);
}

function tocar(evento: EventoDeSonido): boolean {
  const receta = recetaDe(evento, configuracion.tecla);
  const ahora = performance.now();
  if (callaPorUnaAccion(evento, ahora, calladoHasta)) return false;
  const estado = {
    desbloqueado,
    ganancia: configuracion.ganancia,
    hablando: hayVozHablando(),
    silencioDelPortal: configuracion.silencioDelPortal,
    ultimas,
  };
  if (!debeSonar(estado, receta, ahora)) return false;
  ultimas.set(receta, ahora);
  if (esAccion(evento)) calladoHasta = ahora + VENTANA_DE_LA_ACCION_MS;
  anotarLoQueSono(receta);
  reproducir(receta, configuracion.ganancia).then(quitarElFallo, anotarFallo);
  return true;
}

/** Lo que se espera antes de recargar la página para que el sonido alcance a oírse. */
export const ESPERA_ANTES_DE_IRSE_MS = 300;

/**
 * Para lo que va seguido de recargar la página (entrar con PIN, salir): la recarga corta el
 * audio, así que si de verdad va a sonar se espera un momento; si no (aparato en Apagado, sin
 * desbloquear), no se espera nada.
 */
export function sonarAntesDeIrse(evento: EventoDeSonido): Promise<void> {
  if (!tocar(evento)) return Promise.resolve();
  return new Promise((listo) => {
    setTimeout(listo, ESPERA_ANTES_DE_IRSE_MS);
  });
}

/**
 * Para la página de Sonidos: la receta suena aunque el aparato esté en «Apagado» (quien pulsa
 * «Oír» quiere oírla), con el volumen del aparato o, si está apagado, el de «Suave» al 70.
 */
export function oir(receta: NombreDeReceta, ganancia: number): void {
  desbloqueado = true;
  anotarLoQueSono(receta);
  reproducir(receta, ganancia).then(quitarElFallo, anotarFallo);
}

/** El último fallo de reproducción, para decirlo en Configuración → Sonidos. */
export function falloDelSonido(): string | null {
  return fallo;
}

export function suscribirAlFallo(escucha: () => void): () => void {
  escuchasDelFallo.add(escucha);
  return () => {
    escuchasDelFallo.delete(escucha);
  };
}
