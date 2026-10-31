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

export {
  IMAN,
  LADO_CORTO_MAXIMO,
  LADO_LARGO_MAXIMO,
  TOLERANCIA_DE_CONTACTO,
  atraer,
  grupoDe,
  medidasDeMesa,
  revisarUnion,
  seTocan,
  type MesaEnPlano,
} from './union.ts';
