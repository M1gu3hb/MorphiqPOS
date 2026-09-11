export { colorDePersona, etiquetaDeRol, rolMH, type RolMH } from './roles.ts';
export { consultar, type Ambito, type PeticionConsulta } from './consultar.ts';
export { escribir, type AmbitoEscritura, type PeticionEscritura } from './escribir.ts';
export { entidadMapeada, MAPA } from './mapa.ts';
export {
  CONFIG_POR_OMISION,
  guardarConfiguracionParcial,
  leerConfiguracion as leerConfiguracionMH,
  PUBLICOS as CAMPOS_PUBLICOS_DE_CONFIGURACION,
} from './configuracion.ts';
export { listarUsuariosPOS } from './usuarios.ts';
export { LIMITE_MAXIMO, LIMITE_POR_OMISION } from './tipos.ts';
