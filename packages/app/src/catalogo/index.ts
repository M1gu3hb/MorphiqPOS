export { entradaBuscarProductos, listarProductos } from './consulta.ts';
export { consultarInicioProduccion } from './inicio.ts';
export type { PaginaProductos, ProductoResumen } from './consulta.ts';
export {
  actualizarProducto,
  archivarProducto,
  asignarCodigoBarras,
  cambiarPrecioProducto,
  crearProducto,
} from './productos.ts';
export { crearModificadorProducto } from './modificadores.ts';
export {
  entradaActualizarProducto,
  entradaArchivarProducto,
  entradaAsignarCodigo,
  entradaCambiarPrecio,
  entradaCrearModificador,
  entradaCrearProducto,
} from './esquemas.ts';

export {
  guardarModificadores,
  entradaGuardarModificadores,
  type ResultadoGuardarModificadores,
} from './modificadores-guardar.ts';

export { altaRapida, entradaAltaRapida, type ResultadoAltaRapida } from './alta-rapida.ts';

export {
  asignarFiscalMasivo,
  entradaFiscalMasivo,
  type ProductoSinLitros,
  type ResultadoFiscalMasivo,
} from './fiscal-masivo.ts';
