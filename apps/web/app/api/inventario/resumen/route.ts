import { consultarInventarioProduccion } from '@morphiqpos/app/inventario';

import { responderConsulta } from '../../../../src/servidor/http';

export const dynamic = 'force-dynamic';

export function GET(peticion: Request): Promise<Response> {
  return responderConsulta(peticion, (sesion) =>
    consultarInventarioProduccion(sesion.organizacionId),
  );
}
