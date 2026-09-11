import { consultarInicioProduccion } from '@morphiqpos/app/catalogo';

import { responderConsulta } from '../../../../src/servidor/http';

export const dynamic = 'force-dynamic';

export function GET(): Promise<Response> {
  return responderConsulta((sesion) => consultarInicioProduccion(sesion), {
    roles: ['dueno', 'administrador', 'gerente'],
  });
}
