/**
 * `ferreteria` — el modelo que hereda de `abarrotes` y lo desborda por tres
 * lados: la medida como eje del catálogo, el material que se corta y el crédito
 * con autorizados.
 *
 * Lo que NO vive aquí porque ya vive en `abarrotes`: presentaciones, conteo por
 * zona, el dinero ajeno y el redondeo. Si un modelo de retail reinventa alguno
 * de ésos, está mal hecho.
 */
export {
  buscarMaterial,
  declararAtributo,
  entradaBuscarMaterial,
  entradaDeclararAtributo,
  type MaterialEncontrado,
  type ResultadoAtributo,
  type ResultadoBusqueda,
} from './catalogo.ts';

export {
  cortarMaterial,
  ejecutarCorte,
  entradaCortarMaterial,
  type EntradaDeCorte,
  type ResultadoCorte,
} from './corte.ts';

export {
  cortarYAgregar,
  entradaCortarYAgregar,
  type ResultadoCorteMostrador,
} from './corte-mostrador.ts';

export {
  abrirNotaDeMostrador,
  crearNotaMostrador,
  entradaCrearNotaMostrador,
  type DatosDeNota,
  type NotaAbierta,
  type ResultadoNotaMostrador,
} from './nota-de-mostrador.ts';

export {
  entradaEvaluarSalida,
  entradaRegistrarRemision,
  evaluarSalida,
  registrarRemision,
  type ResultadoEvaluacion,
  type ResultadoRemision,
} from './credito.ts';

export {
  altaAutorizado,
  bajaAutorizado,
  cerrarObra,
  crearObra,
  entradaAltaAutorizado,
  entradaBajaAutorizado,
  entradaCerrarObra,
  entradaCrearObra,
  type ResultadoAutorizado,
  type ResultadoObra,
} from './obras.ts';

export {
  entradaRegistrarServicio,
  registrarServicio,
  type ConsumoRegistrado,
  type ResultadoServicio,
} from './servicio.ts';

export {
  apartarNota,
  entregarNota,
  entradaApartarNota,
  entradaEntregarNota,
  type ResultadoNota,
} from './notas.ts';

export {
  capturarListaTrabajo,
  cerrarListaTrabajo,
  entradaCapturarLista,
  entradaCerrarLista,
  type ResultadoCierreLista,
  type ResultadoLista,
} from './listas.ts';

export {
  cerrarCotizacion,
  convertirCotizacion,
  crearCotizacion,
  entradaCerrarCotizacion,
  entradaConvertirCotizacion,
  entradaCrearCotizacion,
  entradaRegistrarAprobacion,
  entradaRegistrarEnvio,
  entradaRegistrarSurtido,
  entradaVersionarCotizacion,
  registrarAprobacion,
  registrarEnvio,
  registrarSurtido,
  versionarCotizacion,
  type ResultadoCotizacion,
  type ResultadoSeguimiento,
  type ResultadoSurtido,
} from './cotizacion.ts';

export {
  entradaFotoDeMostrador,
  guardarFotoDeMostrador,
  type ResultadoFoto,
} from './foto-mostrador.ts';

export {
  asignarUbicacion,
  declararEquivalencia,
  declararLinea,
  entradaAsignarUbicacion,
  entradaDeclararEquivalencia,
  entradaDeclararLinea,
  type ResultadoEquivalencia,
  type ResultadoLinea,
  type ResultadoUbicacion,
} from './organizacion-catalogo.ts';

export {
  calibrarPeso,
  conteoPorPeso,
  entradaCalibrarPeso,
  entradaConteoPorPeso,
  type ResultadoCalibracion,
  type ResultadoConteoPeso,
} from './peso.ts';

export {
  entradaEtiquetas,
  etiquetasDeProducto,
  type EtiquetaImpresa,
  type ResultadoEtiquetas,
} from './etiquetas.ts';

export {
  entradaGarantiasPendientes,
  entradaRecibirGarantia,
  entradaResolverGarantia,
  garantiasPendientes,
  recibirGarantia,
  resolverGarantia,
  type GarantiaPendiente,
  type ResultadoGarantia,
} from './garantias.ts';

export {
  devolverRenta,
  entradaDevolverRenta,
  entradaSacarRenta,
  sacarEnRenta,
  type ResultadoDevolucion,
  type ResultadoSalida,
} from './renta.ts';

export {
  abrirPieza,
  entradaAbrirPieza,
  entradaMarcarRetazo,
  entradaPiezasDeProducto,
  marcarRetazo,
  piezasDeProducto,
  type PiezaViva,
  type ResultadoPieza,
  type ResultadoPiezas,
} from './pieza-abierta.ts';

export {
  autorizacionesDeCredito,
  autorizarVentaACredito,
  entradaAutorizacionesDe,
  entradaAutorizarCredito,
  type AutorizacionRegistrada,
  type ResultadoAutorizacion,
  type ResultadoAutorizaciones,
} from './autorizacion-credito.ts';
