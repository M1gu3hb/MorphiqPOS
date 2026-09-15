import { consultarInventarioProduccion } from '@morphiqpos/app/inventario';

import { responderConsulta } from '../../../../src/servidor/http';

export const dynamic = 'force-dynamic';

export function GET(): Promise<Response> {
  return responderConsulta((sesion) => consultarInventarioProduccion(sesion.organizacionId), {
    roles: ['dueno', 'administrador', 'gerente', 'almacen'],
  });
}
