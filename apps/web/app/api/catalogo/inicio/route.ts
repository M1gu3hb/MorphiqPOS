import { consultarInicioProduccion } from '@morphiqpos/app/catalogo';

import { responderConsulta } from '../../../../src/servidor/http';

export const dynamic = 'force-dynamic';

export function GET(peticion: Request): Promise<Response> {
  return responderConsulta(peticion, (sesion) => consultarInicioProduccion(sesion));
}
