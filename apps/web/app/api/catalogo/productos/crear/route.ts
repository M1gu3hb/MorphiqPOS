import { crearProducto } from '@morphiqpos/app/catalogo';

import { ejecutarComandoHttp } from '../../../../../src/servidor/http';

export function POST(peticion: Request): Promise<Response> {
  return ejecutarComandoHttp(crearProducto, peticion);
}
