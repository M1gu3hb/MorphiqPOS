/**
 * `salon` — el arquetipo A3, servicios con cita.
 *
 * Es el único de los cinco modelos que no existía en absoluto: no había
 * plantilla, no había agenda, no había nada del bloque F-4xx. Lo que vive aquí
 * lo heredan `barberia`, `spa`, `unas`, `consultorio` y los demás vecinos de la
 * familia 03.
 *
 * La decisión que lo gobierna todo: la duración de un servicio es una SECUENCIA
 * —aplicación, procesado, terminado, limpieza— y el procesado libera al
 * profesional aunque no libere la estación. De ahí sale el 25 %–40 % de
 * capacidad que ningún competidor del segmento aprovecha.
 */
export {
  agendarCita,
  desdeMultirango,
  entradaAgendarCita,
  type ResultadoAgenda,
  type ServicioAgendado,
} from './agenda.ts';

export {
  cancelarCita,
  cerrarServicio,
  entradaCancelarCita,
  entradaCerrarServicio,
  entradaIniciarCita,
  entradaMarcarNoLlego,
  iniciarCita,
  marcarNoLlego,
  type ResultadoCierre,
  type ResultadoCita,
} from './ciclo.ts';

export {
  cobrarCita,
  entradaCobrarCita,
  type ComisionDeLinea,
  type ResultadoCobroCita,
} from './cobro.ts';
