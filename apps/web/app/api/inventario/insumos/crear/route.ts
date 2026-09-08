import { crearInsumo } from '@morphiqpos/app/inventario';

import { ejecutarComandoHttp } from '../../../../../src/servidor/http';

export function POST(peticion: Request): Promise<Response> {
  return ejecutarComandoHttp(crearInsumo, peticion);
}
