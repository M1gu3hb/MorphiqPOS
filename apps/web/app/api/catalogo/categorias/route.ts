import { consultarCategoriasProduccion } from '@morphiqpos/app/consultas-produccion';

import { responderConsulta } from '../../../../src/servidor/http';

export const dynamic = 'force-dynamic';

export function GET(peticion: Request): Promise<Response> {
  return responderConsulta(peticion, async (sesion) => {
    const categorias = await consultarCategoriasProduccion(sesion.organizacionId);
    return { categorias };
  });
}
