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

export { entradaLiquidar, liquidarProfesional, type ResultadoLiquidacion } from './liquidacion.ts';

export {
  aplicarAnticipo,
  entradaAplicarAnticipo,
  entradaRecibirAnticipo,
  recibirAnticipo,
  type ResultadoAnticipo,
} from './anticipos.ts';

export {
  agendarDesdeEspera,
  anotarEnEspera,
  avisarDeHueco,
  entradaAgendarDesdeEspera,
  entradaAnotarEnEspera,
  entradaAvisarDeHueco,
  type ResultadoEspera,
} from './espera.ts';

export {
  abrirProducto,
  alcanzaLaCabina,
  entradaAbrirProducto,
  entradaAlcanzaCabina,
  type FaltanteDeCabina,
  type ResultadoAlcanza,
  type ResultadoApertura,
} from './cabina.ts';

export {
  entradaEntregarPropina,
  entradaRecibirPropina,
  entregarPropina,
  recibirPropina,
  type ResultadoPropina,
} from './propina-directa.ts';

export { cobrarRenta, entradaCobrarRenta, type ResultadoCobroRenta } from './rentas.ts';

export {
  abrirExpediente,
  entradaAbrirExpediente,
  entradaFotoDeServicio,
  entradaUltimaFormula,
  guardarFotoDeServicio,
  ultimaFormula,
  type Expediente,
  type FormulaAnterior,
  type ResultadoFoto,
  type ResultadoUltimaFormula,
} from './expediente.ts';

export {
  agendaDelDia,
  clientesPorVolver,
  entradaAgendaDelDia,
  entradaHuecos,
  entradaPorVolver,
  entradaProximosHuecos,
  entradaReporteAgenda,
  huecosDisponibles,
  proximosHuecos,
  reporteDeHuecos,
  reporteDeOcupacion,
  type ClientaPorVolver,
  type ColumnaDeAgenda,
  type HuecoOfrecido,
  type ResultadoAgendaDelDia,
  type ResultadoHuecos,
  type ResultadoOcupacion,
  type ResultadoPorVolver,
  type ResultadoReporteHuecos,
} from './consultas.ts';

export {
  agendarWalkIn,
  entradaReprogramar,
  entradaWalkIn,
  reprogramarCita,
  type ResultadoReprogramacion,
} from './reprogramar.ts';

export {
  comisionesDelProfesional,
  comprobanteDeLiquidacion,
  entradaComisionesDe,
  entradaComprobante,
  entradaListaProfesionales,
  entradaMiDia,
  listaDeProfesionales,
  miDia,
  type FichaDeProfesional,
  type ResultadoComisiones,
  type ResultadoComprobante,
  type ResultadoMiDia,
  type ResultadoProfesionales,
} from './profesionales.ts';
