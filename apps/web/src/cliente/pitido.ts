/**
 * EL PITIDO · el canal sonoro del escaneo (C.10 de la 2.4).
 *
 * `04-INTERFAZ` de abarrotes, F-986: «Beep corto + la línea resaltada 1 s + el nombre del
 * último producto en la barra de estado. Tres canales, porque hay ruido». Faltaba éste: la
 * pantalla lo prometía y no sonaba nada. Y el código que no está en el catálogo suena
 * DISTINTO —dos tonos que bajan— para que el cajero lo sepa sin mirar.
 *
 * Con el `AudioContext` del navegador, sin archivos: un sonido que tarda en bajarse es un
 * sonido que llega tarde. Si el navegador no deja sonar —pestaña sin interacción, política de
 * autoplay— el pitido se calla y los otros dos canales siguen: el sonido nunca es el único.
 */

export type Pitido = 'agregado' | 'desconocido';

export interface Tono {
  readonly hz: number;
  /** Cuándo empieza, en segundos desde el disparo. */
  readonly desde: number;
  readonly dura: number;
}

/** Corto y agudo al agregar; dos tonos que BAJAN cuando el código no existe. */
export function tonosDe(pitido: Pitido): readonly Tono[] {
  if (pitido === 'agregado') return [{ hz: 1_760, desde: 0, dura: 0.07 }];
  return [
    { hz: 880, desde: 0, dura: 0.12 },
    { hz: 440, desde: 0.14, dura: 0.18 },
  ];
}

const VOLUMEN = 0.12;
let contexto: AudioContext | null = null;

export function pitar(pitido: Pitido): void {
  try {
    contexto ??= new AudioContext();
    const ahora = contexto.currentTime;
    for (const tono of tonosDe(pitido)) {
      const oscilador = contexto.createOscillator();
      const volumen = contexto.createGain();
      oscilador.type = 'square';
      oscilador.frequency.value = tono.hz;
      volumen.gain.value = VOLUMEN;
      oscilador.connect(volumen).connect(contexto.destination);
      oscilador.start(ahora + tono.desde);
      oscilador.stop(ahora + tono.desde + tono.dura);
    }
  } catch {
    // Sin audio —navegador sin la API o sin permiso de sonar— los otros dos canales siguen.
  }
}
