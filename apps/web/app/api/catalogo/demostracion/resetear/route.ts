import { resetearDemo } from '@morphiqpos/app/demostracion';

import { ejecutarComandoHttp } from '../../../../../src/servidor/http';

export function POST(peticion: Request): Promise<Response> {
  return ejecutarComandoHttp(resetearDemo, peticion);
}
