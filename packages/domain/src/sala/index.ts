export {
  ESTADOS_ESPERA,
  esTransicionDeEsperaValida,
  estimarEspera,
  type ColaDeEspera,
  type EstadoEspera,
} from './espera.ts';

export {
  repartirPoolPorPuntos,
  repartirPropinaPorTramos,
  type BeneficiarioDePool,
  type ParteDelPool,
  type ParteDeTramo,
  type TramoDeAtencion,
} from './propina-repartida.ts';
