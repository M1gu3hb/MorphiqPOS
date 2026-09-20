/**
 * `clientes/` — la ficha del cliente, UNA vez para los cinco modelos.
 *
 * Es la misma persona con distintos campos alrededor: el fiado de la tiendita,
 * el crédito de la obra y el expediente del salón cuelgan de aquí. Escribir un
 * alta por modelo daría tres sitios donde se crea un cliente, tres validaciones
 * de teléfono y tres formas de decir que ya existe.
 */
export {
  altaCliente,
  editarCliente,
  entradaAltaCliente,
  entradaEditarCliente,
  normalizarTelefono,
  type ResultadoCliente,
} from './ficha.ts';
