import { consultarCategoriasProduccion } from '@morphiqpos/app/puente-desarrollo';

import { responderConsulta } from '../../../../src/servidor/http';

export const dynamic = 'force-dynamic';

export function GET(): Promise<Response> {
  return responderConsulta(async (sesion) => {
    const categorias = await consultarCategoriasProduccion(sesion.organizacionId);
    return { categorias };
  });
}
