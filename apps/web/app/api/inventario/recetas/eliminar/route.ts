import { eliminarReceta } from '@morphiqpos/app/inventario';

import { ejecutarComandoHttp } from '../../../../../src/servidor/http';

/**
 * B-12 · borrar la receta y retirar el producto, en una sola transacción.
 *
 * Va en `recetas/eliminar` y no en un `DELETE` sobre `recetas`: no es el borrado
 * de un recurso REST, es un comando que además archiva el producto. El nombre de
 * la ruta dice lo que pasa.
 */
export function POST(peticion: Request): Promise<Response> {
  return ejecutarComandoHttp(eliminarReceta, peticion);
}
