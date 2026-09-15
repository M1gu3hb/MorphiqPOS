export {
  entradaGuardarConfiguracion,
  guardarConfiguracion,
  leerConfiguracion,
  type ConfiguracionOrganizacion,
} from './configuracion.ts';

export {
  entradaFijarModulo,
  entradaRestablecerModulo,
  fijarModulo,
  modulosDelNegocio,
  restablecerModulo,
  type ModulosDelNegocio,
  type ResultadoDeModulo,
  type ResultadoDeRestablecer,
} from './modulos.ts';

export {
  entradaFijarTermino,
  entradaRestablecerTermino,
  fijarTermino,
  restablecerTermino,
  vocabularioDelNegocio,
  type ResultadoDeRestablecerTermino,
  type ResultadoDeTermino,
} from './vocabulario.ts';
