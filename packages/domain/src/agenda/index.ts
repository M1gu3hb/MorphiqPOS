/**
 * `agenda/` — el motor de A3, el arquetipo de servicios con cita.
 *
 * Todo lo de aquí es puro: entra un objeto con fechas y minutos, sale otro. La
 * base guarda los rangos y hace cumplir la exclusión; estas funciones son las
 * que deciden CUÁLES son esos rangos.
 *
 * Lo que este módulo existe para no perder: que la duración de un servicio es
 * una secuencia y no un número, y que el tiempo de procesado libera al
 * profesional aunque no libere la estación. De esa distinción sale el 25 %–40 %
 * de capacidad que ningún competidor del segmento aprovecha.
 */
export {
  elProfesionalPuede,
  planearCita,
  seEnciman,
  type CitaPlaneada,
  type DuracionDeServicio,
  type Rango,
  type Tramo,
} from './duracion.ts';

export {
  aQuienSeLeOfrece,
  huecosDeAgenda,
  type CandidataEnEspera,
  type Hueco,
  type VentanaDeTrabajo,
} from './huecos.ts';

export {
  calcularComision,
  repartirComision,
  type BaseComision,
  type ComisionCausada,
  type Escalon,
  type EsquemaComision,
  type LineaComisionable,
  type ParteDelServicio,
  type ReglaComision,
  type RepartoComision,
  type RepartoDeComision,
  type TratoDelMaterial,
} from './comision.ts';

export {
  piezasOcupadasEnPico,
  rangoDelRecurso,
  recursosDisponibles,
  type DemandaDeRecurso,
  type OcupacionDeRecurso,
  type TipoDeRecurso,
  type Veredicto,
} from './recursos.ts';
