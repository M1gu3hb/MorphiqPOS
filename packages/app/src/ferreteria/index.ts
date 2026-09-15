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

export { cortarMaterial, entradaCortarMaterial, type ResultadoCorte } from './corte.ts';

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
