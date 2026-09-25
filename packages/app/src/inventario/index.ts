export * from './inventario.ts';
export * from './recetas.ts';
export * from './consultas.ts';
export * from './consumo-interno.ts';

export { entradaKardex, kardexDeInsumo, type ResultadoKardex } from './kardex.ts';
export {
  entradaMotivosDeMerma,
  motivosDeMerma,
  type MotivoDeMerma,
  type ResultadoMotivosDeMerma,
} from './motivos-de-merma.ts';

export {
  enviarTraspaso,
  entradaEnviarTraspaso,
  entradaRecibirTraspaso,
  recibirTraspaso,
  type ResultadoEnvio,
  type ResultadoRecepcion,
} from './traspaso.ts';

export { entradaValuar, tomarValuacion, type ResultadoValuacion } from './valuacion.ts';

export { entradaRegistrarMerma, registrarMerma, type ResultadoMerma } from './merma.ts';
